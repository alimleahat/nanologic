import { expect, test } from '@playwright/test';
import { launch, screenshot } from './app';

test('app launches with the full layout', async () => {
  const { app, page } = await launch();
  for (const id of ['menu-file', 'tb-analyse', 'project-navigator', 'tasks-panel', 'document-area', 'messages-panel', 'statusbar', 'welcome']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const menus = await page.locator('.menubar-button').allTextContents();
  expect(menus).toEqual(['File', 'Edit', 'View', 'Project', 'Assignments', 'Processing', 'Tools', 'Window', 'Help']);
  await screenshot(page, '01-welcome');
  await app.close();
});
