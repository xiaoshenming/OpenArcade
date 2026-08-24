import { expect, test, type Page } from '@playwright/test'

async function openGameLibraryOnMobile(page: Page) {
  const menu = page.getByRole('button', { name: '打开游戏菜单' })
  if (await menu.isVisible()) await menu.click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
})

test('trusted module cannot spend a life without user confirmation', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '琉璃分色' })).toBeVisible()
  await page.getByRole('button', { name: '重开', exact: true }).click()

  await expect(page.getByRole('dialog', { name: '游戏请求重新开始' })).toBeVisible()
  await expect(page.locator('.life-counter strong')).toHaveText('5')
  await page.getByRole('button', { name: '确认重开' }).click()
  await expect(page.locator('.life-counter strong')).toHaveText('4')
})

test('opaque iframe completes MessagePort handshake and ignores window spoofing', async ({ page }) => {
  await openGameLibraryOnMobile(page)
  await page.getByRole('button', { name: /星点节拍/ }).click()
  const iframe = page.locator('iframe[title="星点节拍"]')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(iframe).not.toHaveAttribute('sandbox', /allow-same-origin/)

  const game = page.frameLocator('iframe[title="星点节拍"]')
  await expect(game.getByRole('button', { name: '击中星点' })).toBeVisible()
  await game.getByRole('button', { name: '击中星点' }).click({ force: true })
  await expect(page.locator('.score-block strong')).toHaveText('0010')

  await page.evaluate(() => window.postMessage({
    protocol: 'openarcade:v1', source: 'game', channel: 'forged-channel-value',
    event: { type: 'score', score: 9999 },
  }, '*'))
  await expect(page.locator('.score-block strong')).toHaveText('0010')
})

test('arcade shell has no horizontal overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await expect(page.locator('.cabinet')).toBeInViewport()
})
