import { randomUUID } from 'node:crypto';
import type { Express, Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transactionalRoute } from './database';

type Actor = { sub: string; role: string; tenant_id: string; tenant_slug: string };
type StaffRole = 'owner' | 'waiter' | 'manager' | 'kitchen' | 'cashier';
type Tenant = { id: string; slug: string; tables_count: number };
type Tab = { id: string; table_number: number; status: string; version: number; opened_at: Date };
type RateLimit = (key: string, max: number, seconds?: number) => Promise<boolean>;
const base = '/api/v1/tenants/:slug/garcom';
const tableFields = 'id,table_number,status,version,opened_at';

function actorOf(req: Request) {
  return (req as Request & { user: Actor }).user;
}

function tabDto(row: Tab) {
  return { id: row.id, tableNumber: row.table_number, status: row.status, version: row.version, openedAt: row.opened_at };
}

async function resolveTenant(client: PoolClient, slug: string, lock: boolean) {
  const { rows } = await client.query<Tenant>(
    'SELECT id,slug,tables_count FROM tenants WHERE slug=$1' + (lock ? ' FOR UPDATE' : ''), [slug],
  );
  if (!rows[0]) throw new HttpError(404, 'Restaurante não encontrado.');
  return rows[0];
}

async function resolveRole(client: PoolClient, tenant: Tenant, actor: Actor): Promise<StaffRole> {
  if (actor.tenant_id !== tenant.id || actor.tenant_slug !== tenant.slug) {
    throw new HttpError(403, 'Restaurante fora do escopo da sessão.');
  }
  const flag = await client.query('SELECT garcom_enabled FROM garcom_settings WHERE tenant_id=$1', [tenant.id]);
  if (flag.rows[0]?.garcom_enabled !== true) throw new HttpError(404, 'Aladay Garçom indisponível.');
  if (actor.role === 'TENANT_OWNER') return 'owner';
  if (actor.role === 'GARCOM_STAFF') {
    const { rows } = await client.query<{ role: StaffRole }>(
      'SELECT role FROM garcom_staff WHERE tenant_id=$1 AND user_id=$2', [tenant.id, actor.sub],
    );
    if (rows[0]) return rows[0].role;
  }
  throw new HttpError(403, 'Perfil sem acesso ao Aladay Garçom.');
}

export function mountGarcom(app: Express, pool: Pool, limit: RateLimit, hashPassword: (password: string) => string) {
  app.use(base, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.put(base + '/settings', transactionalRoute(pool, async (req, res, client) => {
    const actor = actorOf(req);
    if (actor.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Ativação restrita à administração.');
    const input = req.body;
    if (typeof input?.enabled !== 'boolean' || Object.keys(input).length !== 1) {
      throw new HttpError(400, 'Configuração inválida.');
    }
    const tenant = await resolveTenant(client, req.params.slug, true);
    await client.query(
      'INSERT INTO garcom_settings (tenant_id,garcom_enabled) VALUES ($1,$2) ON CONFLICT (tenant_id) DO UPDATE SET garcom_enabled=EXCLUDED.garcom_enabled,updated_at=NOW()',
      [tenant.id, input.enabled],
    );
    await client.query(
      "INSERT INTO garcom_audit (tenant_id,actor_id,action,details) VALUES ($1,$2,'settings.updated',$3)",
      [tenant.id, actor.sub, JSON.stringify({ enabled: input.enabled })],
    );
    res.json({ data: { enabled: input.enabled } });
  }));

  app.post(base + '/staff', transactionalRoute(pool, async (req, res, client) => {
    const actor = actorOf(req);
    if (actor.role !== 'TENANT_OWNER') throw new HttpError(403, 'Cadastro restrito ao proprietário.');
    if (!(await limit('garcom:staff:' + actor.sub, 10, 60))) throw new HttpError(429, 'Limite de cadastros excedido.');
    const { name, email, password, role } = req.body ?? {};
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 160 ||
        typeof password !== 'string' || password.length < 12 || password.length > 128 ||
        !['manager','waiter','kitchen','cashier'].includes(role) || Object.keys(req.body).length !== 4) {
      throw new HttpError(400, 'Dados de funcionário inválidos.');
    }
    const tenant = await resolveTenant(client, req.params.slug, true);
    await resolveRole(client, tenant, actor);
    const userId = 'garcom_' + randomUUID();
    const inserted = await client.query(
      "INSERT INTO subscriber_users (id,name,email,password_hash,role,tenant_id,tenant_slug,tenant_name) SELECT $1,$2,$3,$4,'GARCOM_STAFF',id,slug,name FROM tenants WHERE id=$5 ON CONFLICT (email) DO NOTHING RETURNING id",
      [userId, name.trim(), address, hashPassword(password), tenant.id],
    );
    if (!inserted.rowCount) throw new HttpError(409, 'E-mail indisponível.');
    await client.query('INSERT INTO garcom_staff (tenant_id,user_id,role) VALUES ($1,$2,$3)', [tenant.id, userId, role]);
    await client.query(
      "INSERT INTO garcom_audit (tenant_id,actor_id,action,details) VALUES ($1,$2,'staff.created',$3)",
      [tenant.id, actor.sub, JSON.stringify({ userId, role })],
    );
    res.status(201).json({ data: { id: userId, name: name.trim(), role } });
  }));

  app.delete(base + '/staff/:id', transactionalRoute(pool, async (req, res, client) => {
    const actor = actorOf(req);
    if (actor.role !== 'TENANT_OWNER') throw new HttpError(403, 'Revogação restrita ao proprietário.');
    const tenant = await resolveTenant(client, req.params.slug, true);
    if (actor.tenant_id !== tenant.id || actor.tenant_slug !== tenant.slug) throw new HttpError(403, 'Restaurante fora do escopo da sessão.');
    const retired = await client.query('DELETE FROM garcom_staff WHERE tenant_id=$1 AND user_id=$2 RETURNING user_id', [tenant.id, req.params.id]);
    if (!retired.rowCount) throw new HttpError(404, 'Funcionário não encontrado.');
    await client.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [req.params.id]);
    await client.query(
      "INSERT INTO garcom_audit (tenant_id,actor_id,action,details) VALUES ($1,$2,'staff.revoked',$3)",
      [tenant.id, actor.sub, JSON.stringify({ userId: req.params.id })],
    );
    res.json({ data: { revoked: true } });
  }));

  app.get(base + '/tables', transactionalRoute(pool, async (req, res, client) => {
    const tenant = await resolveTenant(client, req.params.slug, false);
    const role = await resolveRole(client, tenant, actorOf(req));
    const { rows } = await client.query<Tab>(
      'SELECT ' + tableFields + " FROM garcom_tabs WHERE tenant_id=$1 AND status='open' ORDER BY table_number",
      [tenant.id],
    );
    const byNumber = new Map(rows.map(tab => [tab.table_number, tabDto(tab)]));
    const numbers = new Set(Array.from({ length: Math.min(1000, tenant.tables_count) }, (_, i) => i + 1));
    for (const number of byNumber.keys()) numbers.add(number);
    const tables = [...numbers].map(number => ({ number, tab: byNumber.get(number) ?? null }));
    res.json({ data: { role, tables } });
  }));

  app.post(base + '/tabs', async (req, res, next) => {
    try {
      if (!(await limit('garcom:open:' + actorOf(req).sub, 30, 60))) {
        return res.status(429).json({ error: 'Limite de aberturas excedido. Tente novamente em um minuto.' });
      }
      next();
    } catch (error) { next(error); }
  }, transactionalRoute(pool, async (req, res, client) => {
    const { tableNumber, idempotencyKey } = req.body ?? {};
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 1000 ||
        typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey) ||
        Object.keys(req.body).length !== 2) {
      throw new HttpError(400, 'Mesa ou chave de operação inválida.');
    }
    const actor = actorOf(req);
    const tenant = await resolveTenant(client, req.params.slug, true);
    const role = await resolveRole(client, tenant, actor);
    if (!['owner', 'manager', 'waiter'].includes(role)) {
      throw new HttpError(403, 'Perfil sem permissão para abrir comandas.');
    }
    const replay = await client.query<Tab>(
      'SELECT t.* FROM garcom_tab_open_requests r JOIN garcom_tabs t ON t.tenant_id=r.tenant_id AND t.id=r.tab_id WHERE r.tenant_id=$1 AND r.actor_id=$2 AND r.idempotency_key=$3',
      [tenant.id, actor.sub, idempotencyKey],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].table_number !== tableNumber) throw new HttpError(409, 'Chave já usada em outra mesa.');
      res.json({ data: tabDto(replay.rows[0]) });
      return;
    }
    if (tableNumber > tenant.tables_count) throw new HttpError(400, 'Mesa fora da configuração do restaurante.');
    const { rows } = await client.query<Tab>(
      'INSERT INTO garcom_tabs (id,tenant_id,table_number,opened_by) VALUES ($1,$2,$3,$4) ' +
      "ON CONFLICT (tenant_id,table_number) WHERE status='open' DO NOTHING RETURNING " + tableFields,
      [randomUUID(), tenant.id, tableNumber, actor.sub],
    );
    if (!rows[0]) throw new HttpError(409, 'Esta mesa já possui uma comanda aberta.');
    const tab = rows[0];
    await client.query(
      'INSERT INTO garcom_tab_open_requests (tenant_id,actor_id,idempotency_key,tab_id) VALUES ($1,$2,$3,$4)',
      [tenant.id, actor.sub, idempotencyKey, tab.id],
    );
    await client.query(
      "INSERT INTO garcom_audit (tenant_id,actor_id,action,tab_id) VALUES ($1,$2,'table.opened',$3)",
      [tenant.id, actor.sub, tab.id],
    );
    res.status(201).json({ data: tabDto(tab) });
  }));
}
