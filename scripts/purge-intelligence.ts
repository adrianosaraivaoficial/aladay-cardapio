import dotenv from 'dotenv';
import pg from 'pg';
import { transaction } from '../backend/database';

dotenv.config();
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para a manutenção.');
const execute = process.argv.includes('--execute');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 6000 });
try {
  const result = await transaction(pool, async client => {
    const counts: Record<string, number> = {};
    for (const [name, table, condition] of [
      ['feedback', 'customer_feedback', 'expires_at<=NOW()'],
      ['feedbackAudit', 'feedback_moderation_events', 'expires_at<=NOW()'],
      ['feedbackInvites', 'feedback_requests', 'expires_at<=NOW() AND NOT EXISTS(SELECT 1 FROM customer_feedback f WHERE f.request_id=feedback_requests.id AND f.tenant_slug=feedback_requests.tenant_slug)'],
      ['crmPreviews', 'crm_migration_previews', 'expires_at<=NOW()'],
    ]) {
      const counted = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${condition}`);
      counts[name] = counted.rows[0].count;
      if (execute) await client.query(`DELETE FROM ${table} WHERE ${condition}`);
    }
    const recovery = await client.query('SELECT COUNT(*)::int AS count FROM crm_migrations WHERE expires_at<=NOW() AND recovery_snapshot IS NOT NULL');
    counts.crmRecoverySnapshots = recovery.rows[0].count;
    if (execute) await client.query('UPDATE crm_migrations SET recovery_snapshot=NULL WHERE expires_at<=NOW() AND recovery_snapshot IS NOT NULL');
    return counts;
  });
  console.log(JSON.stringify({ mode: execute ? 'executed' : 'dry-run', expired: result }));
} finally { await pool.end(); }
