import { expect, test, type Page } from '@playwright/test'
import { WATER_LEVELS } from '../src/games/water-sort/levels'

async function openGameLibraryOnMobile(page: Page) {
  const menu = page.getByRole('button', { name: '打开游戏菜单' })
  if (await menu.isVisible()) await menu.click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('openarcade:e2e-initialized')) return
    localStorage.clear()
    sessionStorage.setItem('openarcade:e2e-initialized', 'true')
  })
  await page.goto('/')
})

test('trusted module cannot spend a life without user confirmation', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '琉璃分色' })).toBeVisible()
  const firstMove = WATER_LEVELS[0].solution.slice(0, 2)
  await page.getByRole('button', { name: new RegExp('^试管 ' + (Number(firstMove[0]) + 1) + '，') }).click()
  await page.getByRole('button', { name: new RegExp('^试管 ' + (Number(firstMove[1]) + 1) + '，') }).click()
  await expect(page.locator('.game-readout strong')).toContainText('01 步')
  await page.getByRole('button', { name: /琉璃分色/ }).click()
  await expect(page.locator('.game-readout strong')).toContainText('01 步')
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
  await expect(page.locator('.score-block strong')).toHaveText('0105')

  await page.evaluate(() => window.postMessage({
    protocol: 'openarcade:v1', source: 'game', channel: 'forged-channel-value',
    event: { type: 'score', score: 9999 },
  }, '*'))
  await expect(page.locator('.score-block strong')).toHaveText('0105')

  await expect(game.locator('#quota')).toHaveText('1/5')
  await page.getByRole('button', { name: '静音' }).click()
  await expect(game.locator('#quota')).toHaveText('1/5')
  for (let hit = 0; hit < 4; hit += 1) await game.getByRole('button', { name: '击中星点' }).click({ force: true })
  await expect(page.getByText('关卡 1 完成')).toBeVisible()
  await expect(page.locator('.life-counter strong')).toHaveText('5')
})

test('solves a verified water level and unlocks the next without spending a life', async ({ page }) => {
  const solution = WATER_LEVELS[0].solution
  for (let offset = 0; offset < solution.length; offset += 2) {
    const from = Number(solution[offset]) + 1
    const to = Number(solution[offset + 1]) + 1
    await page.getByRole('button', { name: new RegExp('^试管 ' + from + '，') }).click()
    await page.getByRole('button', { name: new RegExp('^试管 ' + to + '，') }).click()
  }
  await expect(page.getByText('关卡 1 完成')).toBeVisible()
  await expect(page.locator('.life-counter strong')).toHaveText('5')
  await page.getByRole('button', { name: '下一关' }).click()
  await expect(page.locator('.level-button')).toContainText('关卡 2 / 60')
  await page.locator('.level-button').click()
  await expect(page.getByRole('button', { name: '进入关卡 1' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '当前关卡 2' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '关卡 3，未解锁' })).toBeDisabled()
  await page.reload()
  await expect(page.locator('.level-button')).toContainText('关卡 2 / 60')
  await expect(page.locator('.life-counter strong')).toHaveText('5')
})

test('plays the deterministic Petal Pairs level to completion', async ({ page }) => {
  await page.getByRole('button', { name: /花笺成双/ }).click()
  await expect(page.getByRole('heading', { name: '花笺成双' })).toBeVisible()
  await page.locator('.pair-card').first().waitFor()
  await expect(page.locator('.pairs-preview')).toBeHidden({ timeout: 4_000 })
  const symbols = await page.locator('.pair-card span').allTextContents()
  const pairs = new Map<string, number[]>()
  symbols.forEach((symbol, index) => pairs.set(symbol, [...(pairs.get(symbol) ?? []), index]))
  let matched = 0
  for (const indexes of pairs.values()) {
    await page.locator('.pair-card').nth(indexes[0]).click()
    await page.locator('.pair-card').nth(indexes[1]).click()
    matched += 2
    await expect(page.locator('.pair-card.is-matched')).toHaveCount(matched)
  }
  await expect(page.getByText('关卡 1 完成')).toBeVisible()
})

test('arcade shell has no horizontal overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await expect(page.locator('.cabinet')).toBeInViewport()
})
