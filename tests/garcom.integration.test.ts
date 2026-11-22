import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

interface TablesResponse {
  data: {
    role: string;
    tables: Array<{
      number: number;
      tab: { id: string; tableNumber: number; status: string; version: number; openedAt: string } | null;
    }>;
  };
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

test('Garçom isolates accounts and opens only one active tab per table', { timeout: 60000 }, async t => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString && new URL(connectionString).pathname.endsWith('_test'), 'Use um banco descartável com sufixo _test.');

  const pool = new pg.Pool({ connectionString });
  const suffix = randomBytes(5).toString('hex');
  const tenant = { id: `tenant-garcom-${suffix}`, slug: `garcom-${suffix}` };
  const otherTenant = { id: `tenant-garcom-other-${suffix}`, slug: `garcom-other-${suffix}` };
  const password = 'garcom-only-test-password';
  const accounts = {
    owner: { id: `owner-${suffix}`, email: `owner-${suffix}@example.invalid`, role: 'TENANT_OWNER' },
    waiter: { id: `waiter-${suffix}`, email: `waiter-${suffix}@example.invalid`, role: 'GARCOM_STAFF' },
    unassigned: { id: `unassigned-${suffix}`, email: `unassigned-${suffix}@example.invalid`, role: 'GARCOM_STAFF' },
  };
  const accountIds = Object.values(accounts).map(account => account.id);
  const tenantIds = [tenant.id, otherTenant.id];
  let child: ChildProcess | undefined;
  let output = '';

  t.after(async () => {
    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
      await pool.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::text[])', [accountIds]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::text[])', [tenantIds]);
      await pool.query('DELETE FROM subscriber_users WHERE id = ANY($1::text[])', [accountIds]);
    } finally {
      await pool.end();
    }
  });

  // Startup applies the same module migration as the deployed server. Seed only
  // the tables that the existing auth system needs before startup.
  await pool.query(await readFile('database/easypanel-init.sql', 'utf8'));
  for (const restaurant of [tenant, otherTenant]) {
    await pool.query('INSERT INTO tenants(id, slug, name, tables_count) VALUES($1, $2, $2, 3)', [restaurant.id, restaurant.slug]);
  }
  for (const account of Object.values(accounts)) {
    await pool.query(
      `INSERT INTO subscriber_users(id, name, email, password_hash, role, tenant_id, tenant_slug)
       VALUES($1, $1, $2, $3, $4, $5, $6)`,
      [account.id, account.email, passwordHash(password), account.role, tenant.id, tenant.slug],
    );
  }

  const port = 32204;
  const origin = `http://127.0.0.1:${port}`;
  const address = `192.0.2.${randomBytes(1).readUInt8(0) % 253 + 1}`;
  child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      APP_URL: origin,
      DATABASE_URL: connectionString,
      JWT_SECRET: 'garcom-test-jwt-secret-not-for-production',
      ADMIN_EMAIL: `garcom-admin-${suffix}@example.invalid`,
      ADMIN_PASSWORD: 'garcom-test-admin-password',
      ASAAS_API_KEY: '',
      EVOLUTION_API_KEY: '',
      EVOLUTION_API_URL: '',
      N8N_WEBHOOK_URL: '',
      OUTBOX_WORKER_ENABLED: 'false',
      DISABLE_HMR: 'true',
      TRUST_PROXY_HOPS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr?.on('data', chunk => { output = (output + chunk).slice(-4000); });

  let ready = false;
  for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt += 1) {
    ready = await fetch(`${origin}/api/v1/ready`, { signal: AbortSignal.timeout(1000) }).then(res => res.ok, () => false);
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, `Servidor Garçom não iniciou:\n${output}`);

  async function request<T = unknown>(path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const headers = new Headers({ 'X-Forwarded-For': address });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${origin}${path}`, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() as T };
  }

  async function login(email: string) {
    const result = await request<{ token?: string }>('/api/v1/auth/login', undefined, { email, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.body.token);
    return result.body.token;
  }

  const owner = await login(accounts.owner.email);
  const waiter = await login(accounts.waiter.email);
  const unassigned = await login(accounts.unassigned.email);
  const base = `/api/v1/tenants/${tenant.slug}/garcom`;
  const foreignBase = `/api/v1/tenants/${otherTenant.slug}/garcom`;

  await t.test('requires login and stays off until enabled for the restaurant', async () => {
    assert.equal((await request(`${base}/tables`)).status, 401);
    assert.equal((await request(`${base}/tables`, owner)).status, 404);
    assert.equal((await request(`${base}/tabs`, owner, { tableNumber: 1, idempotencyKey: randomUUID() })).status, 404);
  });

  await pool.query('INSERT INTO garcom_settings(tenant_id, garcom_enabled) VALUES($1, true), ($2, true)', tenantIds);
  await pool.query('INSERT INTO garcom_staff(tenant_id, user_id, role) VALUES($1, $2, $3)', [tenant.id, accounts.waiter.id, 'waiter']);

  await t.test('scopes access to the authenticated restaurant and requires a staff membership', async () => {
    assert.equal((await request(`${foreignBase}/tables`, owner)).status, 403);
    assert.equal((await request(`${foreignBase}/tabs`, waiter, { tableNumber: 1, idempotencyKey: randomUUID() })).status, 403);
    assert.equal((await request(`${base}/tables`, unassigned)).status, 403);
    assert.equal((await request(`/api/v1/tenants/${tenant.slug}/orders`, waiter)).status, 403);

    const tables = await request<TablesResponse>(`${base}/tables`, waiter);
    assert.equal(tables.status, 200);
    assert.equal(tables.body.data.role, 'waiter');
    assert.deepEqual(tables.body.data.tables, [1, 2, 3].map(number => ({ number, tab: null })));
  });

  await t.test('retries return the same opening while competing requests cannot open a second tab', async () => {
    const key = randomUUID();
    const opening = { tableNumber: 1, idempotencyKey: key };
    const duplicates = await Promise.all([request(`${base}/tabs`, waiter, opening), request(`${base}/tabs`, waiter, opening)]);
    assert.deepEqual(duplicates.map(result => result.status).sort(), [200, 201]);
    assert.deepEqual(duplicates[0].body, duplicates[1].body);
    assert.equal((await request(`${base}/tabs`, waiter, { tableNumber: 1, idempotencyKey: randomUUID() })).status, 409);
    assert.equal((await request(`${base}/tabs`, waiter, { tableNumber: 2, idempotencyKey: key })).status, 409);

    const distinctKeys = [randomUUID(), randomUUID()];
    const competing = await Promise.all(distinctKeys.map(idempotencyKey => request(`${base}/tabs`, waiter, { tableNumber: 2, idempotencyKey })));
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]);
    const winner = competing.findIndex(result => result.status === 201);
    assert.equal((await request(`${base}/tabs`, waiter, { tableNumber: 2, idempotencyKey: distinctKeys[winner] })).status, 200);

    const tables = await request<TablesResponse>(`${base}/tables`, owner);
    assert.equal(tables.status, 200);
    const [first, second, third] = tables.body.data.tables;
    assert.ok(first?.tab && second?.tab);
    assert.equal(first.tab.tableNumber, 1);
    assert.equal(second.tab.tableNumber, 2);
    assert.notEqual(first.tab.id, second.tab.id);
    assert.equal(first.tab.status, 'open');
    assert.equal(first.tab.version, 1);
    assert.ok(Number.isFinite(Date.parse(first.tab.openedAt)));
    assert.deepEqual(third, { number: 3, tab: null });

    const active = await pool.query("SELECT id FROM garcom_tabs WHERE tenant_id = $1 AND status = 'open' ORDER BY table_number", [tenant.id]);
    assert.deepEqual(active.rows, [{ id: first.tab.id }, { id: second.tab.id }]);
    const audit = await pool.query("SELECT tab_id FROM garcom_audit WHERE tenant_id = $1 AND action = 'table.opened' ORDER BY id", [tenant.id]);
    assert.deepEqual(audit.rows, [{ tab_id: first.tab.id }, { tab_id: second.tab.id }]);
  });

  await t.test('only the owner provisions Garçom accounts and revocation invalidates their sessions', async () => {
    const staff = { name: 'Caixa de teste', email: `cashier-${suffix}@example.invalid`, password, role: 'cashier' };
    assert.equal((await request(`${base}/staff`, waiter, staff)).status, 403);
    const created = await request<{ data: { id: string; role: string } }>(`${base}/staff`, owner, staff);
    assert.equal(created.status, 201);
    assert.match(created.body.data.id, /^garcom_[a-f0-9-]{36}$/);
    accountIds.push(created.body.data.id);
    assert.equal(created.body.data.role, 'cashier');
    assert.equal((await request(`${base}/staff`, owner, staff)).status, 409);
    const cashier = await login(staff.email);
    const tables = await request<TablesResponse>(`${base}/tables`, cashier);
    assert.equal(tables.status, 200);
    assert.equal(tables.body.data.role, 'cashier');
    assert.equal((await request(`${base}/tabs`, cashier, { tableNumber: 3, idempotencyKey: randomUUID() })).status, 403);

    const staffPath = `${base}/staff/${created.body.data.id}`;
    assert.equal((await request(staffPath, waiter, undefined, 'DELETE')).status, 403);
    assert.equal((await request(staffPath, owner, undefined, 'DELETE')).status, 200);
    assert.equal((await request(`${base}/tables`, cashier)).status, 401);
  });

  await t.test('applies membership and flag changes to an already authenticated session', async () => {
    await pool.query("UPDATE garcom_staff SET role = 'kitchen' WHERE tenant_id = $1 AND user_id = $2", [tenant.id, accounts.waiter.id]);
    const tables = await request<TablesResponse>(`${base}/tables`, waiter);
    assert.equal(tables.status, 200);
    assert.equal(tables.body.data.role, 'kitchen');
    assert.equal((await request(`${base}/tabs`, waiter, { tableNumber: 3, idempotencyKey: randomUUID() })).status, 403);

    await pool.query('DELETE FROM garcom_staff WHERE tenant_id = $1 AND user_id = $2', [tenant.id, accounts.waiter.id]);
    assert.equal((await request(`${base}/tables`, waiter)).status, 403);
    await pool.query('UPDATE garcom_settings SET garcom_enabled = false WHERE tenant_id = $1', [tenant.id]);
    assert.equal((await request(`${base}/tables`, owner)).status, 404);
  });
});
