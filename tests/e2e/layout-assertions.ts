import { expect, type Page } from '@playwright/test';

/** Assert painted regions, including the record icon, not just page overflow. */
export async function separatedShell(page: Page) {
  const shell = page.getByTestId('study-shell');
  const geometry = await shell.evaluate((element) => {
    const header = element.querySelector(':scope > header')!.getBoundingClientRect();
    const main = element.querySelector(':scope > main')!.getBoundingClientRect();
    const footer = element.querySelector(':scope > footer')!.getBoundingClientRect();
    const nav = element.querySelector('nav')!;
    const centers = (selector: string) =>
      Array.from(nav.querySelectorAll(selector), (node) => {
        const box = node.getBoundingClientRect();
        return box.top + box.height / 2;
      });
    const content = element
      .querySelector(':scope > main')!
      .firstElementChild!.getBoundingClientRect();
    return {
      iconCenters: centers('button > span:first-child'),
      labelCenters: centers('button > span:last-child'),
      headerBottom: header.bottom,
      mainTop: main.top,
      mainBottom: main.bottom,
      footerTop: footer.top,
      footerBottom: footer.bottom,
      menuTop: Math.min(
        ...[nav, ...nav.querySelectorAll('button, span, svg')].map(
          (node) => node.getBoundingClientRect().top,
        ),
      ),
      viewportHeight: innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      bodyScroll: window.scrollY,
      contentCenter: content.x + content.width / 2,
      viewportCenter: innerWidth / 2,
    };
  });
  expect(geometry.headerBottom).toBeLessThanOrEqual(geometry.mainTop + 1);
  expect(geometry.mainBottom).toBeLessThanOrEqual(geometry.footerTop + 1);
  expect(geometry.mainBottom).toBeLessThanOrEqual(geometry.menuTop + 1);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.bodyScroll).toBe(0);
  expect(Math.abs(geometry.contentCenter - geometry.viewportCenter)).toBeLessThanOrEqual(1);
  for (const centers of [geometry.iconCenters, geometry.labelCenters]) {
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  }
  return shell.locator(':scope > main');
}

export async function captureShellScroll(page: Page, project: string, name: string) {
  const main = await separatedShell(page);
  for (const [position, fraction] of [
    ['top', 0],
    ['middle', 0.5],
    ['bottom', 1],
  ] as const) {
    await main.evaluate((element, fraction) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction;
    }, fraction);
    await separatedShell(page);
    await page.screenshot({
      path: `test-results/${project}-${name}-layout-${position}.png`,
      fullPage: false,
    });
  }
  return main;
}
