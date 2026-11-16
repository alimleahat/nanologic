// End-to-end tests of the experimental Basys 3 support.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, mockFolderDialog, ROOT, screenshot } from './app';

async function waitTask(page: Page, task: string, status: 'passed' | 'failed') {
  await expect(page.getByTestId(`task-${task}`)).toHaveAttribute('data-status', status, { timeout: 120_000 });
}

/** Segments 0-6 of a digit that look lit (brightness >= 0.8), as a 7-character 0/1 string. */
async function digitPattern(page: Page, d: number): Promise<string> {
  const b = (await page.getByTestId(`board-digit${d}`).getAttribute('data-brightness')) ?? '';
  return b
    .split(',')
    .slice(0, 7)
    .map((x) => (Number(x) >= 0.8 ? '1' : '0'))
    .join('');
}

const ZERO = '1111110';
const ONE = '0110000';

test('new Basys 3 project from the wizard, marked experimental, with standard pins mapped', async () => {
  const { app, page, tmp } = await launch();
  await page.getByTestId('welcome-new').click();
  await page.getByTestId('wizard-name').fill('b3proj');
  await page.getByTestId('wizard-folder').fill(path.join(tmp, 'projects'));
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('board-picker').selectOption('basys3');
  await expect(page.getByTestId('board-picker')).toContainText('Digilent Basys 3 (Experimental - not yet verified on hardware)');
  await expect(page.getByTestId('board-experimental')).toBeVisible();
  await screenshot(page, 'b3-01-wizard-board');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByTestId('wizard-summary-board')).toContainText('xc7a35tcpg236-1');
  await page.getByTestId('wizard-finish').click();
  await waitTask(page, 'analysis', 'passed');
  const projectFile = path.join(tmp, 'projects', 'b3proj', 'b3proj.nlproj');
  await expect.poll(() => JSON.parse(fs.readFileSync(projectFile, 'utf8')).pinAssignments.length).toBe(1 + 16 + 5 + 16 + 7 + 1 + 4);
  expect(JSON.parse(fs.readFileSync(projectFile, 'utf8')).boardId).toBe('basys3');
  await expect(page.getByTestId('tb-export')).toHaveText('Export to Vivado');
  await app.close();
});

test('Basys 3 starter on the virtual board: LEDs, buttons and the scanned display', async () => {
  const { app, page } = await launch();
  await page.getByTestId('example-basys3-starter').click();
  await waitTask(page, 'analysis', 'passed');
  await page.getByTestId('tb-board').click();
  await waitTask(page, 'board', 'passed');
  await expect(page.getByTestId('board-experimental')).toBeVisible();

  await page.getByTestId('board-sw0').click();
  await expect(page.getByTestId('board-led0')).toHaveAttribute('data-lit', '1');

  // Max speed: persistence of vision shows all four digits as 0000.
  await page.getByTestId('board-speed-max').click();
  await page.getByTestId('board-run').click();
  await expect(page.getByTestId('board-display')).toHaveAttribute('data-mode', 'persistence');
  const allDigits = async () => (await Promise.all([3, 2, 1, 0].map((d) => digitPattern(page, d)))).join(' ');
  await expect.poll(allDigits, { timeout: 60_000 }).toBe([ZERO, ZERO, ZERO, ZERO].join(' '));

  // Hold btnU (active-high) long enough to be sampled, then release: 0001.
  const btn = page.getByTestId('board-btnU');
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect.poll(() => digitPattern(page, 0), { timeout: 60_000 }).toBe(ONE);
  await expect.poll(() => digitPattern(page, 1), { timeout: 60_000 }).toBe(ZERO);
  await screenshot(page, 'b3-02-board-starter');

  // Slow clock: the display shows only the enabled digit.
  await page.getByTestId('board-speed-10').click();
  await expect(page.getByTestId('board-display')).toHaveAttribute('data-mode', 'instant');
  await app.close();
});

test('reference project on the Basys 3: the pin planner explains the shared segments', async () => {
  const { app, page, tmp } = await launch();
  const copy = path.join(tmp, 'tl-copy');
  fs.cpSync(path.join(ROOT, 'tests/fixtures/fpga-traffic-light-controller'), copy, { recursive: true });
  await mockFolderDialog(app, copy);
  await page.getByTestId('welcome-import').click();
  await page.getByTestId('import-choose').click();
  await page.getByTestId('import-name').fill('tl_b3');
  await page.getByTestId('import-confirm').click();
  await waitTask(page, 'analysis', 'passed');

  page.on('dialog', (d) => void d.accept());
  await page.getByTestId('menu-project').click();
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('board-picker').selectOption('basys3');
  await page.getByTestId('settings-ok').click();
  await waitTask(page, 'analysis', 'passed');
  await expect(page.getByTestId('statusbar')).toContainText('Digilent Basys 3');

  await page.getByTestId('menu-assignments').click();
  await page.getByTestId('menu-pin-planner').click();
  const notice = page.getByTestId('pins-multiplex-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('HexH');
  await expect(notice).toContainText('share one set of segment lines');
  await screenshot(page, 'b3-03-pins-multiplex-notice');
  await app.close();
});

test('Basys 3 starter: level 3 export to Vivado', async () => {
  const { app, page, tmp } = await launch();
  await page.getByTestId('example-basys3-starter').click();
  await waitTask(page, 'analysis', 'passed');
  await page.getByTestId('tb-export').click();
  await expect(page.getByTestId('dialog-export')).toContainText('Export to Vivado');
  await page.getByTestId('export-level-3').check();
  await page.getByTestId('export-dest').fill(path.join(tmp, 'exports'));
  await page.getByTestId('export-run').click();
  await expect(page.getByTestId('export-result')).toContainText('create_project.tcl');
  await expect(page.getByTestId('export-result')).toContainText('experimental');
  const folder = path.join(tmp, 'exports', 'basys3_starter_vivado');
  const xdc = fs.readFileSync(path.join(folder, 'basys3_starter.xdc'), 'utf8');
  expect(xdc).toContain('EXPERIMENTAL - NOT YET VERIFIED ON HARDWARE');
  expect(xdc).toContain('set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports clk]');
  expect(fs.readFileSync(path.join(folder, 'create_project.tcl'), 'utf8')).toContain('-part xc7a35tcpg236-1');
  await screenshot(page, 'b3-04-export');
  await app.close();
});
