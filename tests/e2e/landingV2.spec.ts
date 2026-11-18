import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

const landingUrl = process.env.ALADAY_LANDING_URL || '/';
const origin = 'http://127.0.0.1:32200';
let server: ChildProcess;
let output = '';

test.beforeAll(async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('E2E exige TEST_DATABASE_URL de banco descartável com sufixo _test.');
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    env: { ...process.env, NODE_ENV: 'development', PORT: '32200', DATABASE_URL: databaseUrl,
      JWT_SECRET: 'e2e-only-jwt-secret-at-least-32-characters', ADMIN_EMAIL: 'landing-e2e@example.invalid',
      ADMIN_PASSWORD: 'e2e-only-admin-password', OUTBOX_WORKER_ENABLED: 'false', DISABLE_HMR: 'true',
      MENU_IMPORT_AI_ENABLED: 'false', GEMINI_API_KEY: '', ASAAS_API_KEY: '', EVOLUTION_API_KEY: '',
      EVOLUTION_API_URL: '', IFOOD_CLIENT_SECRET: '', APP_URL: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => output = (output + chunk).slice(-6000));
  server.stderr?.on('data', chunk => output = (output + chunk).slice(-6000));
  for (let attempt = 0; attempt < 160; attempt++) {
    try { if ((await fetch(`${origin}/api/v1/ready`)).ok) return; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Landing E2E server did not become ready: ${output}`);
});

test.afterAll(async () => {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
});

test('landing v2 preserves entry points and the local cart demonstration', async ({ page }) => {
  await page.goto(landingUrl);
  await expect(page.getByRole('heading', { name: /Mais pedidos.*Menos correria/ })).toBeVisible();
  await expect(page.getByText('R$ 129,90', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar Hambúrguer especial ao carrinho' }).click();
  await page.getByRole('button', { name: /Ver meu pedido/ }).click();
  await expect(page.locator('#v2-cart-details')).toContainText('R$ 29,90');
  await page.getByRole('button', { name: 'Simular finalização' }).click();
  await expect(page.getByRole('status')).toContainText('Nenhum pedido foi enviado');

  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acesso ao Painel do Restaurante' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Rodapé Aladay' })).toBeVisible();
  await page.locator('.site-v2-header .site-v2-brand-link').click();
  await page.getByRole('button', { name: 'Começar grátis', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Cadastro para Período de Teste Grátis/ })).toBeVisible();
});

test('v2 navigation and footer remain usable across public application views', async ({ page }) => {
  await page.goto(landingUrl);
  const footer = page.getByRole('contentinfo', { name: 'Rodapé Aladay' });
  await expect(footer.getByRole('link', { name: 'Calculadora de economia' })).toBeVisible();
  await footer.getByRole('link', { name: 'Termos de Uso' }).click();
  await expect(page.getByText('Cláusulas dos Termos de Uso')).toBeVisible();
  await expect(page).toHaveURL(/\/terms$/);
  await page.reload();
  await expect(page.getByText('Cláusulas dos Termos de Uso')).toBeVisible();
  await expect(page.locator('.site-v2-header .site-v2-brand-symbol')).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Planos' }).click();
  await expect(page.locator('#planos')).toBeInViewport();
  await footer.getByRole('link', { name: 'Calculadora de economia' }).click();
  await expect(page.locator('#calculadora')).toBeInViewport();
});

test('landing v2 mobile menu navigates without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(landingUrl);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação móvel' }).getByRole('link', { name: 'Planos' }).click();
  await expect(page.locator('#planos')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('contentinfo', { name: 'Rodapé Aladay' }).getByRole('link', { name: 'Política de Privacidade' }).click();
  await expect(page.getByText('Seções da Política LGPD')).toBeVisible();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.reload();
  await expect(page.getByText('Seções da Política LGPD')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
