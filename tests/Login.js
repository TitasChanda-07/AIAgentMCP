const { test, expect } = require('@playwright/test');

test('Login successfully to SauceDemo', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');

  await expect(page).toHaveTitle(/Swag Labs/);

  await page.locator('[data-test="username"]').fill('standard_user');
  await page.locator('[data-test="password"]').fill('secret_sauce');
  await page.locator('[data-test="login-button"]').click();

  await expect(page).toHaveURL(/.*inventory\.html/);
  await expect(page.locator('[data-test="title"]')).toHaveText('Products');

  console.log('Login successful');
});
