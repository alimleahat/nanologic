// Shared helpers for the Electron end-to-end tests.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '../..');
export const SCREENSHOTS = path.join(ROOT, 'test-results', 'screenshots');

export interface Launched {
  app: ElectronApplication;
  page: Page;
  tmp: string;
}

export async function launch(): Promise<Launched> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nanologic-e2e-'));
  const args = [ROOT];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      NANOLOGIC_E2E: '1',
      NANOLOGIC_USER_DATA: path.join(tmp, 'user-data'),
      NANOLOGIC_PROJECTS_DIR: path.join(tmp, 'projects'),
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await page.waitForSelector('[data-testid="app"]');
  return { app, page, tmp };
}

export async function screenshot(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${process.platform}-${name}.png`) });
}

/** Make the next native folder dialog return `folder` without showing it. */
export async function mockFolderDialog(app: ElectronApplication, folder: string) {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, folder);
}
