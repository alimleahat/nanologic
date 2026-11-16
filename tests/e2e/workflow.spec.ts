// End-to-end tests of the demo in spec section 1, driven through the real UI.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, mockFolderDialog, ROOT, screenshot } from './app';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
// Monaco's "go to start of file" key differs on macOS.
const docStart = process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home';

async function waitTask(page: Page, task: string, status: 'passed' | 'failed') {
  await expect(page.getByTestId(`task-${task}`)).toHaveAttribute('data-status', status, { timeout: 120_000 });
}

test('new project, edit, analyse with click-to-line, save', async () => {
  const { app, page, tmp } = await launch();
  await page.getByTestId('welcome-new').click();
  const dlg = page.getByTestId('dialog-new-project');
  await expect(dlg).toBeVisible();
  await page.getByTestId('wizard-name').fill('blinky');
  await page.getByTestId('wizard-folder').fill(path.join(tmp, 'projects'));
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-top').fill('blinky_top');
  await page.getByTestId('wizard-next').click();
  await screenshot(page, '02-new-project-summary');
  await page.getByTestId('wizard-finish').click();

  await expect(page.getByTestId('tab-file:blinky_top.v')).toBeVisible();
  const projectFile = path.join(tmp, 'projects', 'blinky', 'blinky.nlproj');
  expect(fs.existsSync(projectFile)).toBe(true);
  await waitTask(page, 'analysis', 'passed');
  // Standard port names are mapped automatically after the first analysis.
  await expect.poll(() => JSON.parse(fs.readFileSync(projectFile, 'utf8')).pinAssignments.length).toBe(1 + 2 + 10 + 10 + 48);

  // Introduce a syntax error on line 18 ("assign LEDR = SW;") and analyse.
  const editor = page.getByTestId('verilog-editor');
  await editor.click();
  await page.keyboard.press(docStart);
  for (let i = 0; i < 17; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type(' oops = ;');
  await expect(page.getByTestId('dirty-indicator')).toBeVisible();
  await page.getByTestId('tb-analyse').click();
  await waitTask(page, 'analysis', 'failed');
  const errorRow = page.locator('[data-testid="messages-table"] tr[data-severity="error"]').first();
  await expect(errorRow).toContainText('blinky_top.v');
  await expect(errorRow).toContainText('18');
  await expect(page.locator('.squiggly-error').first()).toBeAttached();
  await screenshot(page, '03-analysis-error');

  // Click the message: the editor moves to that line.
  await page.keyboard.press(docStart);
  await errorRow.click();
  await expect(page.locator('.monaco-editor .current-line').first()).toBeAttached();
  const line = await page.evaluate(() => {
    // @ts-expect-error exposed by the editor module for debugging
    return window.__nanologicStore?.get().reveal?.line;
  });
  expect(line).toBe(18);

  // Undo the error, save with Ctrl/Cmd+S, analyse again.
  await page.getByTestId('verilog-editor').click();
  const dirtyText = () =>
    page.evaluate(() => {
      // @ts-expect-error debug handle
      const d = window.__nanologicStore.get().docs.find((x) => x.kind === 'editor');
      return d.text !== d.saved;
    });
  for (let i = 0; i < 20 && (await dirtyText()); i++) await page.keyboard.press(`${mod}+z`);
  await page.keyboard.type('// edited');
  await page.keyboard.press(`${mod}+s`);
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await page.getByTestId('tb-analyse').click();
  await waitTask(page, 'analysis', 'passed');
  await expect(page.getByTestId('status-text')).toContainText('Analysis passed');

  // Hierarchy view and templates panel.
  await page.getByTestId('nav-hierarchy').click();
  await expect(page.getByTestId('hier-blinky_top')).toBeVisible();
  await page.getByTestId('menu-view').click();
  await page.getByRole('menuitem', { name: 'Templates' }).click();
  await expect(page.getByTestId('templates-panel')).toBeVisible();
  await screenshot(page, '04-editor-templates');
  await app.close();
});

test('reference project: analyse, simulate a testbench and inspect the waveform', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-traffic-light').click();
  await waitTask(page, 'analysis', 'passed');
  await page.getByTestId('nav-hierarchy').click();
  await expect(page.getByTestId('hier-clkdiv')).toBeVisible();
  await expect(page.locator('[data-testid="messages-table"] tr[data-severity="error"]')).toHaveCount(0);

  await page.getByTestId('tb-simulate').click();
  await page.getByTestId('simulate-tb').selectOption('tb/legacy/CoreLogic_tb.v');
  await page.getByTestId('simulate-run').click();
  await waitTask(page, 'simulation', 'passed');
  await expect(page.getByTestId('waveform-viewer')).toBeVisible();
  await expect(page.getByTestId('wave-names')).toContainText('ControlSignal');

  // Cursor and values.
  const canvas = page.getByTestId('wave-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + 40);
  await expect(page.getByTestId('wave-cursor-time')).not.toHaveText('0 s');
  await page.getByTestId('wave-zoom-in').click();
  await page.getByTestId('wave-fit').click();
  await page.getByTestId('wave-radix').selectOption('bin');
  await screenshot(page, '05-waveform');
  await app.close();
});

test('starter example on the virtual board: switches, keys, clock and polarities', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-starter').click();
  await waitTask(page, 'analysis', 'passed');
  await page.getByTestId('tb-board').click();
  await waitTask(page, 'board', 'passed');
  await expect(page.getByTestId('board-view')).toBeVisible();

  // Switch up -> LED above it lights.
  await expect(page.getByTestId('board-LEDR3')).toHaveAttribute('data-lit', '0');
  await page.getByTestId('board-SW3').click();
  await expect(page.getByTestId('board-LEDR3')).toHaveAttribute('data-lit', '1');

  // HEX0 shows 0 after reset: active-low segments, all lit except the middle.
  const hex0 = page.getByTestId('board-HEX0');
  await expect(hex0).toHaveAttribute('data-levels', '00000011'); // bit 0 first: "0" = 1000000, DP off
  // Single step: the bypassed divider makes each clock a count.
  await page.getByTestId('board-step').click();
  await expect(hex0).toHaveAttribute('data-levels', '10011111'); // "1" = 1111001, DP off
  // Run at 1 kHz, then hold KEY[0] (reset, active-low).
  await page.getByTestId('board-speed-1000').click();
  await page.getByTestId('board-run').click();
  await expect(page.getByTestId('board-clock-info')).toContainText('Running');
  await screenshot(page, '06-board-starter');
  await page.getByTestId('board-run').click();
  const key0 = page.getByTestId('board-KEY0');
  const kb = (await key0.boundingBox())!;
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await expect(hex0).toHaveAttribute('data-levels', '00000011');
  await page.mouse.up();
  await app.close();
});

test('reference project on the virtual board with the 1 Hz divider bypassed', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-traffic-light').click();
  await waitTask(page, 'analysis', 'passed');
  await page.getByTestId('tb-board').click();
  await waitTask(page, 'board', 'passed');
  await expect(page.getByTestId('bypass-clkdiv.CLK_1Hz')).toBeVisible();
  // Lamps are LEDR0-2; Red (LEDR0) is on after power-up.
  await expect(page.getByTestId('board-LEDR0')).toHaveAttribute('data-lit', '1');
  // Step the (bypassed) 1 Hz clock until the lamp changes to amber.
  let amber = false;
  for (let i = 0; i < 20 && !amber; i++) {
    await page.getByTestId('board-step').click();
    await page.waitForTimeout(50);
    amber = (await page.getByTestId('board-LEDR1').getAttribute('data-lit')) === '1';
  }
  expect(amber).toBe(true);
  await page.getByTestId('board-speed-10').click();
  await page.getByTestId('board-run').click();
  await screenshot(page, '07-board-traffic-light');
  await app.close();
});

test('pin planner, export to Quartus (level 3) and import of an existing folder', async () => {
  const { app, page, tmp } = await launch();
  // Import the reference project folder (a copy, so the fixture is never touched).
  const copy = path.join(tmp, 'tl-copy');
  fs.cpSync(path.join(ROOT, 'tests/fixtures/fpga-traffic-light-controller'), copy, { recursive: true });
  await mockFolderDialog(app, copy);
  await page.getByTestId('welcome-import').click();
  await page.getByTestId('import-choose').click();
  await expect(page.getByTestId('import-files')).toContainText('rtl/MainCode.v');
  await expect(page.getByTestId('import-top')).toHaveValue('MainCode');
  await page.getByTestId('import-name').fill('tl_import');
  await screenshot(page, '08-import');
  await page.getByTestId('import-confirm').click();
  await waitTask(page, 'analysis', 'passed');

  // Manual mapping: map HexL to HEX0[6:0] in one go, and the button to KEY[0].
  await page.getByTestId('menu-assignments').click();
  await page.getByTestId('menu-pin-planner').click();
  await expect(page.getByTestId('pin-assignments')).toBeVisible();
  await page.getByTestId('pin-group-HexL').selectOption('HEX0@0');
  await page.getByTestId('pin-select-pedestrian_btn').selectOption('KEY[0]');
  await page.getByTestId('pin-select-CLK_50MHz').selectOption('MAX10_CLK1_50');
  await expect(page.getByTestId('pin-row-HexL[3]')).toContainText('PIN_C16');
  await screenshot(page, '09-pin-planner');
  const proj = JSON.parse(fs.readFileSync(path.join(copy, 'tl_import.nlproj'), 'utf8'));
  expect(proj.pinAssignments).toContainEqual({ port: 'pedestrian_btn', bit: null, board: 'KEY[0]' });

  await page.getByTestId('tb-export').click();
  await page.getByTestId('export-level-3').check();
  await page.getByTestId('export-dest').fill(path.join(tmp, 'exports'));
  await page.getByTestId('export-run').click();
  await expect(page.getByTestId('export-result')).toContainText('Exported');
  const qsf = fs.readFileSync(path.join(tmp, 'exports', 'tl_import_quartus', 'tl_import.qsf'), 'utf8');
  expect(qsf).toContain('set_global_assignment -name DEVICE 10M50DAF484C7G');
  expect(qsf).toContain('set_location_assignment PIN_B8 -to pedestrian_btn');
  expect(qsf).toContain('set_location_assignment PIN_C16 -to HexL[3]');
  expect(fs.existsSync(path.join(tmp, 'exports', 'tl_import_quartus', 'tl_import.sdc'))).toBe(true);
  await screenshot(page, '10-export');
  await app.close();
});
