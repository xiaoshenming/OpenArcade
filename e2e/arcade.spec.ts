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
  await expect(page.locator('.score-block strong')).toHaveText('0103')

  await page.evaluate(() => window.postMessage({
    protocol: 'openarcade:v1', source: 'game', channel: 'forged-channel-value',
    event: { type: 'score', score: 9999 },
  }, '*'))
  await expect(page.locator('.score-block strong')).toHaveText('0103')

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

test('first five levels expose visibly different mechanics in every game', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('openarcade:player:v1', JSON.stringify({
    lives: 5, bestScores: {}, unlockedLevels: { 'water-sort': 5, 'orbit-tap': 5, 'petal-pairs': 5 },
  })))
  await page.reload()

  const waterRules = [await page.locator('.water-rule span').textContent()]
  await expect(page.getByRole('button', { name: /禁用撤销/ })).toBeDisabled()
  for (let level = 1; level <= 4; level += 1) {
    await page.locator('.level-button').click()
    await page.getByRole('button', { name: '进入关卡 ' + level }).click()
    waterRules.push(await page.locator('.water-rule span').textContent())
    if (level === 2) await expect(page.locator('.game-readout strong')).toContainText('/')
    if (level === 3) expect(await page.locator('.liquid-layer.is-hidden').count()).toBeGreaterThan(0)
    if (level === 4) await expect(page.locator('.tube.is-locked')).toBeDisabled()
  }
  expect(new Set(waterRules).size).toBe(5)

  await page.getByRole('button', { name: /花笺成双/ }).click()
  await page.locator('.pair-card').first().waitFor()
  const pairRules = [await page.locator('.pairs-rule span').textContent()]
  await expect(page.locator('.pairs-game')).toHaveClass(/mode-shifting/)
  const symbols = await page.locator('.pair-card span').allTextContents()
  const firstPair = symbols.map((symbol, index) => symbols.indexOf(symbol) === index ? [index, symbols.indexOf(symbol, index + 1)] : null).find((pair) => pair && pair[1] >= 0)!
  await expect(page.locator('.pairs-preview')).toBeHidden({ timeout: 3000 })
  await page.locator('.pair-card').nth(firstPair[0]).click()
  await page.locator('.pair-card').nth(firstPair[1]).click()
  await expect(page.locator('.pairs-board')).toHaveAttribute('data-shift', '1')
  for (let level = 1; level <= 4; level += 1) {
    await page.locator('.level-button').click()
    await page.getByRole('button', { name: '进入关卡 ' + level }).click()
    await page.locator('.pair-card').first().waitFor()
    pairRules.push(await page.locator('.pairs-rule span').textContent())
    if (level === 2) await expect(page.locator('.pair-card.is-revealed')).toHaveCount(1)
    if (level === 3) await expect(page.locator('.pairs-rule')).toContainText('失误 0/2')
    if (level === 4) await expect(page.locator('.pairs-rule')).toContainText('目标')
  }
  expect(new Set(pairRules).size).toBe(5)

  await page.getByRole('button', { name: /星点节拍/ }).click()
  let game = page.frameLocator('iframe[title="星点节拍"]')
  await game.locator('#mode').waitFor()
  const orbitRules = [await game.locator('#mode').textContent()]
  await expect(game.locator('#stage')).toHaveAttribute('data-mode', 'combo')
  await game.getByRole('button', { name: '击中星点' }).click({ force: true })
  await game.getByRole('button', { name: '击中星点' }).click({ force: true })
  await expect(game.locator('#rule-state')).toHaveText('连击 ×2')
  for (let level = 1; level <= 4; level += 1) {
    await page.locator('.level-button').click()
    await page.getByRole('button', { name: '进入关卡 ' + level }).click()
    game = page.frameLocator('iframe[title="星点节拍"]')
    await game.getByRole('button', { name: '击中星点' }).waitFor({ state: 'visible' })
    orbitRules.push(await game.locator('#mode').textContent())
  }
  expect(new Set(orbitRules).size).toBe(5)
  await game.getByRole('button', { name: '避开干扰星点' }).click({ force: true })
  await expect(game.locator('#rule-state')).toHaveText('失误 1/3')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
})

test('final chapters combine mechanics instead of repeating one rule', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('openarcade:player:v1', JSON.stringify({
    lives: 5, bestScores: {}, unlockedLevels: { 'water-sort': 60, 'orbit-tap': 30, 'petal-pairs': 40 },
  })))
  await page.reload()
  await expect(page.locator('.water-rule')).toContainText('终局·万色归一')
  expect(await page.locator('.liquid-layer.is-hidden').count()).toBeGreaterThan(0)
  await expect(page.locator('.tube.is-locked')).toBeDisabled()
  await expect(page.getByRole('button', { name: /禁用撤销/ })).toBeDisabled()
  await expect(page.locator('.game-readout strong')).toContainText('/')
  const opening = WATER_LEVELS[59].solution.slice(0, 10)
  for (let offset = 0; offset < opening.length; offset += 2) {
    await page.locator('.tube').nth(Number(opening[offset])).click()
    await page.locator('.tube').nth(Number(opening[offset + 1])).click()
  }
  await expect(page.locator('.tube.is-locked')).toHaveCount(0)

  await page.getByRole('button', { name: /花笺成双/ }).click()
  await page.locator('.pair-card').first().waitFor()
  await expect(page.locator('.pairs-game')).toHaveClass(/mode-gauntlet/)
  await expect(page.locator('.pairs-rule')).toContainText('目标')
  await expect(page.locator('.pairs-rule')).toContainText('失误 0/')
  const targetSymbol = (await page.locator('.pairs-rule em').first().textContent())!.replace('目标 ', '')
  let finaleSymbols = await page.locator('.pair-card span').allTextContents()
  const targetCards = finaleSymbols.map((symbol, index) => symbol === targetSymbol ? index : -1).filter((index) => index >= 0)
  await page.locator('.pair-card').nth(targetCards[0]).click()
  await page.locator('.pair-card').nth(targetCards[1]).click()
  await expect(page.locator('.pairs-board')).toHaveAttribute('data-shift', '1')
  finaleSymbols = await page.locator('.pair-card span').allTextContents()
  const unmatched = await page.locator('.pair-card:not(.is-matched)').evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('aria-label')!.match(/\d+/)![0]) - 1))
  const mismatch = unmatched.find((index) => finaleSymbols[index] !== finaleSymbols[unmatched[0]])!
  await page.locator('.pair-card').nth(unmatched[0]).click()
  await page.locator('.pair-card').nth(mismatch).click()
  await expect(page.locator('.pairs-rule')).toContainText('失误 1/')

  await page.getByRole('button', { name: /星点节拍/ }).click()
  const game = page.frameLocator('iframe[title="星点节拍"]')
  await game.getByRole('button', { name: '击中星点' }).waitFor({ state: 'visible' })
  await expect(game.locator('#mode')).toHaveText('星域主宰')
  await expect(game.locator('#rule-state')).toContainText('失误 0/3')
  await expect(game.locator('#rule-state')).toContainText('连击 ×1')
  await expect(game.getByRole('button', { name: '避开干扰星点' })).toHaveCount(3)
  const position = await game.getByRole('button', { name: '击中星点' }).getAttribute('style')
  await page.waitForTimeout(850)
  expect(await game.getByRole('button', { name: '击中星点' }).getAttribute('style')).not.toBe(position)
  await page.getByRole('button', { name: '暂停游戏' }).click()
  await expect(page.getByText('已暂停')).toBeVisible()
  const pausedPosition = await game.getByRole('button', { name: '击中星点' }).boundingBox()
  await page.waitForTimeout(850)
  const frozenPosition = await game.getByRole('button', { name: '击中星点' }).boundingBox()
  expect(frozenPosition!.x).toBeCloseTo(pausedPosition!.x, 1)
  expect(frozenPosition!.y).toBeCloseTo(pausedPosition!.y, 1)
  await page.getByRole('button', { name: '继续游戏' }).click()
  const geometryIssues = await game.locator('#stage').evaluate((stage) => {
    const boundary = stage.getBoundingClientRect()
    return [...stage.querySelectorAll('*')].filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return style.display !== 'none' && rect.width > 0 && rect.height > 0 && (rect.left < boundary.left - 2 || rect.right > boundary.right + 2 || rect.top < boundary.top - 2 || rect.bottom > boundary.bottom + 2 || (element.children.length === 0 && Boolean(element.textContent?.trim()) && element.scrollWidth > element.clientWidth + 2))
    }).length
  })
  expect(geometryIssues).toBe(0)
})

test('arcade shell has no horizontal overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await expect(page.locator('.cabinet')).toBeInViewport()
})
