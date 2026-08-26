const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const screenshotsDir = path.join(__dirname, '..', 'test-results', 'Screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

test('Login successfully to SauceDemo', async ({ page }) => {
  const loginPageShot = path.join(screenshotsDir, 'Login_01_login_page.png');
  const credentialsShot = path.join(screenshotsDir, 'Login_02_credentials_entered.png');
  const productsPageShot = path.join(screenshotsDir, 'Login_03_inventory_page.png');
  const sortedPageShot = path.join(screenshotsDir, 'Login_04_products_filtered.png');

  await page.goto('https://www.saucedemo.com/');
  await page.screenshot({ path: loginPageShot, fullPage: true });
  await expect(page).toHaveTitle(/Swag Labs/);

  await page.locator('[data-test="username"]').fill('standard_user');
  await page.locator('[data-test="password"]').fill('secret_sauce');
  await page.screenshot({ path: credentialsShot, fullPage: true });

  await page.locator('[data-test="login-button"]').click();
  await expect(page).toHaveURL(/.*inventory\.html/);
  await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  await page.screenshot({ path: productsPageShot, fullPage: true });

  await page.locator('[data-test="product-sort-container"]').selectOption('za');
  await page.screenshot({ path: sortedPageShot, fullPage: true });

  console.log('Login successful');
});
