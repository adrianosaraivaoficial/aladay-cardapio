import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = new URL(process.env.ALADAY_AUDIT_URL || 'http://127.0.0.1:4173');
const vitalsPath = process.env.ALADAY_WEB_VITALS_PATH;
if (!vitalsPath) throw new Error('Defina ALADAY_WEB_VITALS_PATH para dist/web-vitals.iife.js.');
const vitals = readFileSync(vitalsPath, 'utf8');
const axe = process.env.ALADAY_AXE_PATH && readFileSync(process.env.ALADAY_AXE_PATH, 'utf8');

const scenarios = [
  {
    name: 'Landing',
    path: '/',
    ready: page => page.getByRole('heading', { name: /Do cardápio digital/ }),
    interact: page => page.locator('button[aria-controls^="faq-answer"]').nth(1).click(),
  },
  {
    name: 'Cardápio demo',
    path: '/demo/cardapio',
    ready: page => page.getByRole('heading', { name: 'Restaurante Demonstração Aladay' }),
    interact: page => page.getByRole('searchbox').pressSequentially('burger', { delay: 60 }),
  },
  {
    name: 'Login Garçom',
    path: '/app/garcom/',
    ready: page => page.locator('input[type="email"]'),
    interact: page => page.locator('input[type="email"]').pressSequentially('teste', { delay: 60 }),
  },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ executablePath });
const viewport = { width: 390, height: 844 };
function keepLocal(route) {
  const { protocol, origin } = new URL(route.request().url());
  return origin === base.origin || ['data:', 'blob:'].includes(protocol) ? route.continue() : route.abort();
}

try {
  for (const scenario of scenarios) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.route('**/*', keepLocal);
      await context.addInitScript({
        content: vitals + `
          localStorage.setItem('aladay_cookie_consent_v1', 'denied');
          window.aladayMetrics = {};
          const record = ({ name, value }) => { window.aladayMetrics[name] = value; };
          webVitals.onLCP(record, { reportAllChanges: true });
          webVitals.onCLS(record, { reportAllChanges: true });
          webVitals.onINP(record, { reportAllChanges: true });`,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 40, downloadThroughput: 1_250_000, uploadThroughput: 625_000,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const response = await page.goto(new URL(scenario.path, base).href);
      assert(response?.ok(), scenario.name);
      await scenario.ready(page).waitFor();
      await page.waitForFunction(() => typeof window.aladayMetrics.LCP === 'number');
      await scenario.interact(page);
      await page.waitForFunction(() => typeof window.aladayMetrics.INP === 'number', null, { timeout: 10000 });
      const sample = await page.evaluate(() => ({
        ...window.aladayMetrics,
        localRequests: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin).length,
      }));
      console.log(JSON.stringify({ scenario: scenario.name, run, ...sample, errors }));
      assert.deepEqual(errors, [], scenario.name);
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
  const page = await context.newPage();
  await context.route('**/*', keepLocal);
  await page.goto(new URL('/app/garcom/', base).href);
  await page.locator('input[type="email"]').waitFor();
  if (axe) {
    await page.evaluate(axe);
    const result = await page.evaluate(async () => {
      const { violations } = await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'] } });
      return violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
    });
    console.log(JSON.stringify({ scenario: 'Login Garçom WCAG', violations: result }));
    assert.deepEqual(result, []);
  }
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
  const registration = await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const manifest = await fetch(manifestUrl).then(response => response.json());
    const cache = await caches.open('aladay-garcom-offline-v1');
    return { scope: new URL(worker.scope).pathname, start: manifest.start_url, assets: (await cache.keys()).map(request => new URL(request.url).pathname) };
  });
  assert.deepEqual(registration, { scope: '/app/garcom/', start: '/app/garcom/', assets: ['/app/garcom/offline.html'] });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: /está offline/ }).waitFor();
  console.log(JSON.stringify({ scenario: 'Garçom PWA offline', ...registration }));
  await context.close();
} finally {
  await browser.close();
}

