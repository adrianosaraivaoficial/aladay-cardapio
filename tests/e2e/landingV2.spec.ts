import { test, expect } from '@playwright/test';

const landingUrl = process.env.ALADAY_LANDING_URL || '/';

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
  await page.getByRole('button', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Começar grátis', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Cadastro para Período de Teste Grátis/ })).toBeVisible();
});

test('landing v2 mobile menu navigates without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(landingUrl);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegação móvel' }).getByRole('link', { name: 'Planos' }).click();
  await expect(page.locator('#planos')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
