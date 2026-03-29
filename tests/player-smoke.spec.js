const { test, expect } = require('@playwright/test');

test.describe('Konata Station smoke', () => {
  test('renderiza player, discord y footer temporal', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('.page-logo')).toBeVisible();
    await expect(page.locator('#player-frame')).toBeVisible();
    await expect(page.locator('#discord-frame')).toBeVisible();
    await expect(page.locator('.temporary-footer')).toContainText('Esta página es una versión temporal');
  });

  test('sincroniza altura de Discord con el player en desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/index.html');

    const playerHeight = await page.locator('#player-frame').evaluate((node) => Math.round(node.getBoundingClientRect().height));
    const discordHeight = await page.locator('#discord-frame').evaluate((node) => Math.round(node.getBoundingClientRect().height));

    expect(Math.abs(playerHeight - discordHeight)).toBeLessThanOrEqual(2);
  });

  test('limita ancho del player en tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/index.html');

    const playerWidth = await page.locator('#player-frame').evaluate((node) => Math.round(node.getBoundingClientRect().width));
    expect(playerWidth).toBeLessThanOrEqual(400);
  });
});
