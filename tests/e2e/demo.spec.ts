import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

const origin = 'http://localhost:32201';
let server: ChildProcess;
let output = '';

test.beforeAll(async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '32201', '--strictPort'], {
    env: { ...process.env, DISABLE_HMR: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => { output += chunk; });
  server.stderr?.on('data', chunk => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    if (await fetch(origin + '/demo').then(response => response.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Vite da demonstração indisponível.\n' + output);
});

test.afterAll(() => { server?.kill(); });

async function add(page: Page, name: string, quantity = '1') {
  await page.getByRole('button', { name: 'Escolher ' + name }).click();
  const dialog = page.getByRole('dialog', { name });
  await dialog.getByLabel('Quantidade').selectOption(quantity);
  await dialog.getByRole('button', { name: /Adicionar ao carrinho/ }).click();
  await expect(dialog).toBeHidden();
}

test('landing opens the isolated demo and the trial returns to commercial signup', async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  await page.goto(origin);
  const ctas = page.getByRole('link', { name: 'Abrir Demonstração Interativa' });
  await expect(ctas).toHaveCount(2);
  for (const cta of await ctas.all()) await expect(cta).toHaveAttribute('href', '/demo');
  await ctas.first().click();
  await expect(page).toHaveURL(origin + '/demo');
  await expect(page.getByRole('heading', { name: 'Restaurante Demonstração Aladay' })).toBeVisible();
  await expect(page.locator('[aria-current=step]')).toHaveText('Conheça o cardápio digital');
  await expect(page.getByRole('link', { name: 'Voltar ao site Aladay' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'Burger da Casa' })).toBeVisible();
  await page.getByRole('button', { name: 'Bebidas' }).click();
  await expect(page.getByRole('heading', { name: 'Limonada da casa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Burger da Casa' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Iniciar teste grátis' }).click();
  await expect(page).toHaveURL(origin + '/?teste-gratis=1');
  await expect(page.getByRole('heading', { name: /Cadastro para Período de Teste Grátis/ })).toBeVisible();
});

test('cart, duplicate checkout, immediate tab updates, status, reload and reset have no operational requests', async ({ page, context, browser }) => {
  const unexpected: string[] = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.origin !== origin || url.pathname.startsWith('/api/')) unexpected.push(request.url());
  });
  await page.goto(origin + '/demo/cardapio?slug=restaurante-real');
  const panel = await context.newPage();
  await panel.goto(origin + '/demo/painel');
  await expect(panel.getByText('Nenhum pedido na sessão')).toBeVisible();
  await add(page, 'Burger da Casa', '2');
  await expect(page.locator('[aria-current=step]')).toHaveText('Monte seu pedido');
  await add(page, 'Batatas crocantes');
  await page.getByRole('button', { name: 'Remover Batatas crocantes' }).click();
  await page.getByRole('button', { name: 'Diminuir quantidade de Burger da Casa' }).click();
  await page.getByRole('button', { name: 'Aumentar quantidade de Burger da Casa' }).click();
  await expect(page.getByRole('complementary', { name: 'Carrinho' })).toContainText(/65,80/);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Carrinho' })).toContainText(/65,80/);

  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  const checkout = page.getByRole('dialog', { name: 'Checkout simulado' });
  await expect(page.locator('[aria-current=step]')).toHaveText('Simule o checkout');
  await expect(checkout.getByRole('button', { name: 'Confirmar pedido simulado' })).toBeDisabled();
  await checkout.getByRole('radio', { name: 'Pix simulado' }).check();
  await expect(checkout).toContainText('sem validade financeira');
  await expect(checkout.locator('canvas, img, input:not([type=radio])')).toHaveCount(0);
  await checkout.getByRole('button', { name: 'Confirmar pedido simulado' }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole('dialog', { name: 'Pedido simulado recebido' })).toContainText('#DEMO-001');
  await expect(page.locator('[aria-current=step]')).toHaveText('Veja o pedido recebido');
  await expect(panel.locator('[aria-current=step]')).toHaveText('Conheça os recursos de gestão');
  await expect(panel.getByRole('heading', { name: 'Pedido #DEMO-001' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /#DEMO-/ })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Marcar como em preparo' }).click();
  await expect(page.getByRole('dialog', { name: 'Pedido simulado recebido' })).toContainText('Em preparo');
  await page.getByRole('link', { name: 'Ver pedido no painel' }).click();
  await expect(page).toHaveURL(origin + '/demo/painel');
  await page.getByRole('button', { name: 'Marcar como pronto' }).click();
  await page.getByRole('button', { name: 'Marcar como concluído' }).click();
  await expect(panel.getByRole('button', { name: /#DEMO-001.*Concluído/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Marcar como/ })).toHaveCount(0);

  const separate = await browser.newContext();
  try {
    const other = await separate.newPage();
    await other.goto(origin + '/demo/painel');
    await expect(other.getByText('Nenhum pedido na sessão')).toBeVisible();
  } finally { await separate.close(); }

  await page.getByRole('button', { name: 'Reiniciar demonstração' }).click();
  await page.getByRole('button', { name: 'Limpar dados da demonstração' }).click();
  await expect(panel.getByText('Nenhum pedido na sessão')).toBeVisible();
  await panel.reload();
  await expect(panel.getByText('Nenhum pedido na sessão')).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('mobile viewport and keyboard navigation expose both views and dialog controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(origin + '/demo');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  const burger = page.getByRole('button', { name: 'Escolher Burger da Casa' });
  await burger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Burger da Casa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(burger).toBeFocused();
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await noOverflow()).toBe(true);
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Painel do restaurante' })).toBeVisible();
  expect(await noOverflow()).toBe(true);
});

test('operational Pix UI recovers from charge failure and reports clipboard refusal honestly', async ({ page }) => {
  let attempts = 0;
  let status = 'PENDING';
  await page.route('**/api/v1/pix/charges', route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'Cobrança temporariamente indisponível.' } });
    return route.fulfill({ json: { data: { status: 'PENDING', pixCopiaECola: 'PIX-UI-TEST-ONLY', txid: 'fixture-tx' } } });
  });
  await page.route('**/api/v1/pix/fixture-tx/status', route => route.fulfill({ json: { status } }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    } });
  });

  await page.goto(origin + '/tests/e2e/fixtures/pix.html');
  await expect(page.getByRole('alert')).toHaveText('Cobrança temporariamente indisponível.');
  await expect(page.getByText(/escaneie o QR Code/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Já realizei o pagamento Pix' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tentar carregar cobrança' }).click();
  await expect(page.getByRole('img', { name: 'QR Code Pix' })).toBeVisible();
  await page.getByRole('button', { name: 'Copiar Código' }).click();
  await expect(page.getByText(/O navegador bloqueou a cópia/)).toBeVisible();
  await expect(page.getByText('Copiado!')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Código Pix Copia e Cola' })).toBeFocused();
  await page.getByRole('button', { name: 'Já realizei o pagamento Pix' }).click();
  await expect(page.getByRole('alert')).toContainText('Pagamento ainda não confirmado');
  status = 'PAID';
  await expect(page.getByText('Pagamento Registrado')).toBeVisible();
});
