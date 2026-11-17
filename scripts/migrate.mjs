import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const files = ['easypanel-init.sql', 'intelligence.sql', 'crm.sql', 'menu-import.sql', 'analytics.sql', 'upsell.sql', 'feedback.sql'];
const databaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database');
const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm-database='))?.split('=')[1];
const connectionString = process.env.MIGRATION_DATABASE_URL;

if (!connectionString) throw new Error('Defina MIGRATION_DATABASE_URL para o banco alvo.');
const target = new URL(connectionString);
const databaseName = decodeURIComponent(target.pathname.slice(1));
if (!databaseName || databaseName.includes('/')) throw new Error('Nome do banco inválido.');
if (apply && confirmation !== databaseName) throw new Error('Para aplicar, informe --confirm-database=<nome exato do banco>.');

const scripts = files.map((name) => {
  const sql = fs.readFileSync(path.join(databaseDir, name), 'utf8');
  return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
});

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 6000 });

async function exists(table) {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
  return result.rows[0].present;
}

async function countDuplicates(table, columns, where = 'TRUE') {
  if (!await exists(table)) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS groups FROM (
    SELECT ${columns} FROM ${table} WHERE ${where} GROUP BY ${columns} HAVING COUNT(*)>1
  ) duplicates`);
  return result.rows[0].groups;
}

async function preflight() {
  const checks = {
    orderIdempotencyDuplicates: await countDuplicates('orders', 'tenant_slug,idempotency_key', 'idempotency_key IS NOT NULL'),
    pixOrderDuplicates: await countDuplicates('pix_transactions', 'order_id'),
    pixEndToEndDuplicates: await countDuplicates('pix_transactions', 'end_to_end_id', 'end_to_end_id IS NOT NULL'),
  };
  return { checks, safeToApply: Object.values(checks).every((count) => count === 0) };
}

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const initial = await preflight();
  await client.query('ROLLBACK');
  process.stdout.write(`${JSON.stringify({ event: 'migration_preflight', database: databaseName, ...initial })}\n`);
  if (!apply) process.exitCode = initial.safeToApply ? 0 : 2;
  else {
    if (!initial.safeToApply) throw new Error('Preflight encontrou duplicidades; reconcilie os dados antes da migração.');
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '5min'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('aladay_schema'))");
      const locked = await preflight();
      if (!locked.safeToApply) throw new Error('Duplicidades surgiram durante o preflight; migração cancelada.');
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT NOW()
      )`);
      for (const script of scripts) {
        const previous = await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [script.name]);
        if (previous.rows[0]) {
          if (previous.rows[0].checksum.trim() !== script.checksum) throw new Error(`Migração alterada após aplicação: ${script.name}`);
          continue;
        }
        await client.query(script.sql);
        await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [script.name, script.checksum]);
        process.stdout.write(`${JSON.stringify({ event: 'migration_applied', file: script.name })}\n`);
      }
      await client.query('COMMIT');
      process.stdout.write(`${JSON.stringify({ event: 'migration_complete', database: databaseName })}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: 'migration_failed', message: error instanceof Error ? error.message : 'Erro desconhecido' })}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
