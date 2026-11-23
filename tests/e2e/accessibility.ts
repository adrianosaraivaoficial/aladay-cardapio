import { expect, type Page } from '@playwright/test';

export async function assertAccessible(page: Page, selector: string) {
  const axePath = process.env.ALADAY_AXE_PATH;
  if (!axePath) return;
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async context => {
    const { axe } = window as unknown as { axe: {
      run(context: string, options: object): Promise<{
        violations: { id: string; nodes: { target: unknown; failureSummary?: string }[] }[];
      }>;
    } };
    const result = await axe.run(context, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      },
    });
    return result.violations.map(({ id, nodes }) => ({
      id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
  }, selector);
  expect(violations, `Acessibilidade de ${selector}`).toEqual([]);
}
