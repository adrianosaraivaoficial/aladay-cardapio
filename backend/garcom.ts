import type { OrderItem } from '../src/types';
import { priceOrderItems } from './order-items';
import { fingerprint } from './security';
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

  mountTabCommands(app, pool, limit);

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

type GarcomItemRow = { id: string; snapshot: OrderItem; order_id: string | null; order_status: string | null };

async function findTab(client: PoolClient, tenant: Tenant, id: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new HttpError(404, 'Comanda não encontrada.');
  const { rows } = await client.query<Tab>('SELECT ' + tableFields + ' FROM garcom_tabs WHERE tenant_id=$1 AND id=$2', [tenant.id, id]);
  if (!rows[0]) throw new HttpError(404, 'Comanda não encontrada.');
  return rows[0];
}

function toItem(row: GarcomItemRow) {
  return { ...row.snapshot, id: row.id, orderId: row.order_id, orderStatus: row.order_status };
}

const itemFields = 'i.id,i.snapshot,i.order_id,o.status AS order_status';
const itemTable = ' FROM garcom_tab_items i LEFT JOIN orders o ON o.id=i.order_id AND o.tenant_id=i.tenant_id WHERE i.tenant_id=$1 AND i.tab_id=$2';

function mountTabCommands(app: Express, pool: Pool, limit: RateLimit) {
  app.get(base + '/catalog', transactionalRoute(pool, async (req, res, client) => {
    const tenant = await resolveTenant(client, req.params.slug, false);
    await resolveRole(client, tenant, actorOf(req));
    const { rows } = await client.query(
      'SELECT id,name,category_id AS "categoryId",price_cents AS "priceCents",option_groups AS "optionGroups" FROM products WHERE tenant_id=$1 AND tenant_slug=$2 AND is_available ORDER BY name,id',
      [tenant.id, tenant.slug],
    );
    const categories = await client.query('SELECT id,name FROM categories WHERE tenant_id=$1 AND tenant_slug=$2 ORDER BY name,id', [tenant.id, tenant.slug]);
    res.json({ data: { products: rows, categories: categories.rows } });
  }));

  app.get(base + '/tabs/:id', transactionalRoute(pool, async (req, res, client) => {
    const tenant = await resolveTenant(client, req.params.slug, true);
    await resolveRole(client, tenant, actorOf(req));
    const tab = await findTab(client, tenant, req.params.id);
    const { rows } = await client.query<GarcomItemRow>('SELECT ' + itemFields + itemTable + ' ORDER BY i.created_at,i.id', [tenant.id, tab.id]);
    const items = rows.map(toItem);
    res.json({ data: { ...tabDto(tab), items, totalCents: items.reduce((total, item) => total + item.totalCents, 0) } });
  }));

  type Command = (client: PoolClient, tenant: Tenant, tab: Tab, actor: Actor, input: Request['body']) => Promise<object>;
  function command(action: string, keys: string[], run: Command) {
    return transactionalRoute(pool, async (req, res, client) => {
      const actor = actorOf(req);
      if (!(await limit('garcom:tab:' + actor.sub, 100, 60))) throw new HttpError(429, 'Limite de operações excedido.');
      const input = req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some(key => !keys.includes(key) && key !== 'idempotencyKey' && key !== 'expectedVersion') ||
          !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
          typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.idempotencyKey)) {
        throw new HttpError(400, 'Operação de comanda inválida.');
      }
      const tenant = await resolveTenant(client, req.params.slug, true);
      const role = await resolveRole(client, tenant, actor);
      if (!['owner', 'manager', 'waiter'].includes(role)) throw new HttpError(403, 'Perfil sem permissão para alterar comandas.');
      const tab = await findTab(client, tenant, req.params.id);
      const scope = [tenant.id, tab.id, actor.sub, input.idempotencyKey];
      const requestHash = fingerprint([action, input.expectedVersion, keys.map(key => input[key])]);
      const replay = await client.query('SELECT request_hash,result FROM garcom_tab_commands WHERE tenant_id=$1 AND tab_id=$2 AND actor_id=$3 AND idempotency_key=$4', scope);
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new HttpError(409, 'Chave reutilizada com outra operação.');
        res.json({ data: replay.rows[0].result });
        return;
      }
      if (tab.status !== 'open') throw new HttpError(409, 'Comanda encerrada.');
      if (tab.version !== input.expectedVersion) throw new HttpError(409, 'Comanda atualizada por outro operador.');
      const result = await run(client, tenant, tab, actor, input);
      await client.query('UPDATE garcom_tabs SET version=version+1 WHERE tenant_id=$1 AND id=$2', [tenant.id, tab.id]);
      await client.query(
        'INSERT INTO garcom_tab_commands (tenant_id,tab_id,actor_id,idempotency_key,request_hash,result) VALUES ($1,$2,$3,$4,$5,$6)',
        [...scope, requestHash, JSON.stringify(result)],
      );
      await client.query(
        'INSERT INTO garcom_audit (tenant_id,actor_id,action,tab_id,details) VALUES ($1,$2,$3,$4,$5)',
        [tenant.id, actor.sub, action, tab.id, JSON.stringify(result)],
      );
      res.status(201).json({ data: result });
    });
  }

  app.post(base + '/tabs/:id/items', command('tab.item_added', ['productId','quantity','notes','selectedOptions'], async (client, tenant, tab, _actor, input) => {
    if (typeof input.productId !== 'string' || input.productId.length > 80 ||
        !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99 ||
        (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 300)) ||
        !Array.isArray(input.selectedOptions) || input.selectedOptions.length > 100 ||
        input.selectedOptions.some((option: unknown) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) return true;
          const value = option as Record<string, unknown>;
          return Object.keys(value).length !== 2 || typeof value.groupId !== 'string' || typeof value.itemId !== 'string';
        })) throw new HttpError(400, 'Produto, quantidade ou adicionais inválidos.');
    const products = await client.query(
      'SELECT id,tenant_slug AS "tenantSlug",name,is_available AS "isAvailable",price_cents AS "priceCents",option_groups AS "optionGroups" FROM products WHERE tenant_id=$1 AND tenant_slug=$2 AND id=$3 FOR SHARE',
      [tenant.id, tenant.slug, input.productId],
    );
    const snapshot = priceOrderItems([input], products.rows, tenant).validatedItems[0];
    const already = await client.query(
      "SELECT count(*)::int AS count,count(*) FILTER (WHERE order_id IS NULL)::int AS pending,COALESCE(sum((snapshot->>'totalCents')::bigint),0) AS total FROM garcom_tab_items WHERE tenant_id=$1 AND tab_id=$2",
      [tenant.id, tab.id],
    );
    if (already.rows[0].pending >= 50) throw new HttpError(409, 'Envie os itens pendentes antes de adicionar outros.');
    if (already.rows[0].count >= 500 || Number(already.rows[0].total) + snapshot.totalCents > 2147483647) {
      throw new HttpError(409, 'A comanda atingiu o limite de itens ou valor.');
    }
    const id = randomUUID();
    await client.query('INSERT INTO garcom_tab_items (id,tenant_id,tenant_slug,tab_id,snapshot) VALUES ($1,$2,$3,$4,$5)', [id, tenant.id, tenant.slug, tab.id, JSON.stringify(snapshot)]);
    return { itemId: id, version: tab.version + 1 };
  }));

  app.post(base + '/tabs/:id/submit', command('order.submitted', [], async (client, tenant, tab) => {
    const { rows } = await client.query<GarcomItemRow>(
      'SELECT ' + itemFields + itemTable + ' AND i.order_id IS NULL ORDER BY i.created_at,i.id LIMIT 51', [tenant.id, tab.id],
    );
    if (!rows.length) throw new HttpError(409, 'A comanda não tem itens novos para enviar.');
    if (rows.length > 50) throw new HttpError(409, 'Há mais de 50 itens na rodada. Envie com menos itens.');
    const totalCents = rows.reduce((total, row) => total + row.snapshot.totalCents, 0);
    const numbering = await client.query('SELECT GREATEST(COALESCE(MAX(order_number),1040),1040)+1 AS number FROM orders WHERE tenant_id=$1', [tenant.id]);
    const tableNumber = String(tab.table_number).padStart(2, '0');
    const orderId = 'ord_' + randomUUID();
    await client.query(
      `INSERT INTO orders (id,order_number,tenant_id,tenant_slug,customer_name,customer_phone,order_type,table_number,
         items,subtotal_cents,total_cents,status,payment_status,payment_method,whatsapp_status,estimated_minutes)
       VALUES ($1,$2,$3,$4,$5,'','dine_in',$6,$7,$8,$8,'received','pending','Conta do salão','queued',15)`,
      [orderId, numbering.rows[0].number, tenant.id, tenant.slug, 'Mesa ' + tableNumber, tableNumber, JSON.stringify(rows.map(row => row.snapshot)), totalCents],
    );
    await client.query('UPDATE garcom_tab_items SET order_id=$3 WHERE tenant_id=$1 AND tab_id=$2 AND order_id IS NULL', [tenant.id, tab.id, orderId]);
    return { orderId, version: tab.version + 1 };
  }));
}
