// End-to-end tests of the Hierarchy tab and the RTL Viewer on the reference project.
import { expect, test, type Page } from '@playwright/test';
import { launch, screenshot } from './app';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function canvasReady(page: Page, module: string) {
  const canvas = page.getByTestId('rtl-canvas');
  await expect(canvas).toHaveAttribute('data-module', module, { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}

test('hierarchy is built from the files straight away and follows saved edits', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-traffic-light').click();
  // The tree comes from the files, without waiting for Analysis.
  await expect(page.getByTestId('hier-clkdiv')).toBeVisible();
  await expect(page.getByTestId('hier-core')).toBeVisible();

  // Rename an instance in MainCode.v and save: the tree updates without running Analysis.
  await expect(page.getByTestId('tab-file:rtl/MainCode.v')).toBeVisible();
  await expect(page.getByTestId('task-analysis')).toHaveAttribute('data-status', 'passed', { timeout: 120_000 });
  await page.evaluate(() => {
    // @ts-expect-error debug handle
    const store = window.__nanologicStore;
    const doc = store.get().docs.find((d: { id: string }) => d.id === 'file:rtl/MainCode.v');
    store.set({ docs: store.get().docs.map((d: { id: string }) => (d === doc ? { ...doc, text: doc.text.replace('Decoder dec (', 'Decoder lamp_decoder (') } : d)) });
  });
  await page.getByTestId('verilog-editor').click();
  await page.keyboard.press(`${mod}+s`);
  await expect(page.getByTestId('hier-lamp_decoder')).toBeVisible();
  await expect(page.getByTestId('hier-dec')).toHaveCount(0);
  await expect(page.getByTestId('task-analysis')).toHaveAttribute('data-status', 'passed');
  await app.close();
});

test('RTL Viewer: open from the menu, highlight, drill in and back, gate view, open from the hierarchy', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-traffic-light').click();
  await expect(page.getByTestId('hier-core')).toBeVisible();

  // Tools > Netlist Viewers > RTL Viewer.
  await page.getByTestId('menu-tools').click();
  await page.getByTestId('menu-netlist-viewers').hover();
  await page.getByTestId('menu-rtl-viewer').click();
  await expect(page.getByTestId('tab-rtl')).toBeVisible();
  await canvasReady(page, 'MainCode');
  for (const inst of ['clkdiv', 'core', 'dec', 'seven_seg', 'CLK_50MHz', 'HexH', 'Green']) await expect(page.getByTestId(`rtl-node-${inst}`)).toBeVisible();
  await expect(page.getByTestId('rtl-breadcrumb')).toHaveText('MainCode');
  await screenshot(page, '10-rtl-viewer-top');

  // Click a wire: its connections are highlighted and described.
  const wire = page.locator('[data-testid^="rtl-edge-"][data-name="CLK_1Hz"]').first();
  await wire.dispatchEvent('click');
  await expect(page.getByTestId('rtl-info')).toContainText('Signal CLK_1Hz (1 bit)');
  await expect(page.getByTestId('rtl-info')).toContainText('Instance clkdiv of ClockDivider');
  await expect(page.getByTestId('rtl-node-core')).toHaveClass(/rtl-hl/);
  await expect(page.getByTestId('rtl-node-dec')).toHaveClass(/rtl-dim/);
  await screenshot(page, '11-rtl-viewer-highlight');

  // Zoom and fit.
  const zoom = page.getByTestId('rtl-zoom-value');
  const before = await zoom.textContent();
  await page.getByTestId('rtl-zoom-in').click();
  await expect(zoom).not.toHaveText(before!);
  await page.getByTestId('rtl-fit').click();
  await expect(zoom).toHaveText(before!);

  // Double-click the CoreLogic instance to open it.
  await page.getByTestId('rtl-node-core').dblclick();
  await canvasReady(page, 'CoreLogic');
  await expect(page.getByTestId('rtl-breadcrumb')).toHaveText('MainCode › core (CoreLogic)');
  for (const n of ['phase', 'ped', 'Counter1', 'match_check', 'ped_mux', 'setting_mux']) await expect(page.getByTestId(`rtl-node-${n}`)).toBeVisible();
  await expect(page.locator('[data-shape="mux"]')).toHaveCount(3);
  await expect(page.locator('[data-shape="op"]')).toHaveCount(1);
  await screenshot(page, '12-rtl-viewer-corelogic');

  // Double-clicking a register jumps to its line in the editor.
  await page.getByTestId('rtl-node-phase').dblclick();
  await expect(page.getByTestId('tab-file:rtl/CoreLogic.v')).toHaveClass(/active/);
  const reveal = await page.evaluate(() => {
    // @ts-expect-error debug handle
    return window.__nanologicStore.get().reveal;
  });
  expect(reveal.line).toBe(50);
  await page.getByTestId('tab-rtl').click();
  await canvasReady(page, 'CoreLogic');

  // Gate-only view: AND, OR, NOT, XOR and flip-flops.
  await page.getByTestId('rtl-mode-gates').click();
  await canvasReady(page, 'CoreLogic');
  const shapes = await page.locator('[data-testid="rtl-canvas"] [data-shape]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-shape')))]);
  expect(shapes.filter((s) => !['and', 'or', 'xor', 'not', 'register', 'module', 'input', 'output', 'const'].includes(s!))).toEqual([]);
  expect(shapes).toEqual(expect.arrayContaining(['and', 'or', 'not', 'register']));
  await screenshot(page, '13-rtl-viewer-gates');
  await page.getByTestId('rtl-mode-rtl').click();

  // Back to the top through the breadcrumb.
  await page.getByTestId('rtl-crumb-0').click();
  await canvasReady(page, 'MainCode');

  // Right-click a module in the Hierarchy tab: open it straight away.
  await page.getByTestId('hier-Counter1').click({ button: 'right' });
  await page.getByTestId('ctx-rtl-viewer').click();
  await canvasReady(page, 'CounterUnit');
  await expect(page.getByTestId('rtl-breadcrumb')).toHaveText('MainCode › core (CoreLogic) › Counter1 (CounterUnit)');
  await screenshot(page, '14-rtl-viewer-from-hierarchy');
  await page.getByTestId('rtl-crumb-1').click();
  await canvasReady(page, 'CoreLogic');
  await app.close();
});
