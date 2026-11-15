import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const integration = process.argv.includes('--integration');
const files = readdirSync('tests').filter(name => name.endsWith('.test.ts') && (name.includes('integration') === integration)).sort();
if (!files.length) throw new Error('Nenhum teste encontrado.');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files.map(name => `tests/${name}`)], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
