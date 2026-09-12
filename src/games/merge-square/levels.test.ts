import { describe, expect, it } from 'vitest'
import { solveWithBot } from './bot'
import { createStartGrid, getMergeLevel, LEVEL_COUNT } from './levels'

const TARGETS = [128, 256, 512, 1024, 2048]
const FACTORS = [1.5, 1.45, 1.4, 1.35, 1.3]

describe('merge square levels', () => {
  it('serves every level from the precomputed table without running the bot', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = getMergeLevel(level)
      expect(getMergeLevel(level)).toEqual(spec)
      expect(spec.botPar).toBeGreaterThan(0)
      expect(spec.budget).toBeGreaterThanOrEqual(spec.botPar)
      expect(spec.target).toBe(TARGETS[spec.chapter - 1])
      const startGrid = createStartGrid(level, spec)
      expect(createStartGrid(level, spec)).toEqual(startGrid)
      expect(startGrid.filter(Boolean).length).toBe(spec.startTiles)
      expect(startGrid.filter((tile) => tile?.locked).length).toBe(spec.startLocks)
      expect(startGrid.filter((tile) => tile?.fixed).length).toBe(spec.startFixed)
      for (const value of spec.startValues) {
        expect(startGrid.some((tile) => tile?.value === value)).toBe(true)
      }
      expect(spec.startTiles).toBeLessThanOrEqual(11)
      expect(startGrid.every((tile) => tile === null || (tile.fixed === true || tile.fixed === false))).toBe(true)
    }
  })

  it('verifies every recorded par by independent bot replay', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = getMergeLevel(level)
      const par = solveWithBot({
        levelNumber: level,
        target: spec.target,
        startGrid: createStartGrid(level, spec),
        lockQuota: spec.spawnLocks,
        lockChance: spec.spawnLockChance,
        moveCap: 2600,
      })
      expect(par, `level ${level} recorded par must replay`).toBe(spec.botPar)
      expect(par).toBeLessThanOrEqual(spec.budget)
    }
  }, 40000)

  it('anchors every chapter two start with one or two fixed blocks', () => {
    for (let level = 13; level <= 24; level += 1) {
      const spec = getMergeLevel(level)
      expect(spec.startFixed, `level ${level} fixed anchors`).toBeGreaterThanOrEqual(1)
      expect(spec.startFixed).toBeLessThanOrEqual(2)
      const startGrid = createStartGrid(level, spec)
      startGrid.forEach((tile) => {
        if (tile?.fixed) {
          expect(tile.value).toBeGreaterThanOrEqual(2)
          expect(tile.locked).toBe(false)
        }
      })
    }
  })

  it('builds five chapters that stack anchors, locks and fog', () => {
    const specs = Array.from({ length: LEVEL_COUNT }, (_, index) => getMergeLevel(index + 1))
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const slice = specs.slice((chapter - 1) * 12, chapter * 12)
      expect(slice.every((spec) => spec.chapter === chapter)).toBe(true)
      expect(slice.every((spec) => spec.target === TARGETS[chapter - 1])).toBe(true)
    }
    expect(specs.slice(0, 12).every((spec) => !spec.fog && spec.startLocks === 0 && spec.spawnLocks === 0 && spec.startFixed === 0)).toBe(true)
    expect(specs.slice(12, 24).every((spec) => !spec.fog && spec.startLocks === 0 && spec.spawnLocks === 0 && spec.startFixed > 0)).toBe(true)
    expect(specs.slice(24, 36).every((spec) => !spec.fog && spec.startLocks > 0 && spec.spawnLockChance > 0 && spec.startFixed === 0)).toBe(true)
    expect(specs.slice(36, 48).every((spec) => spec.fog && spec.startLocks === 0 && spec.spawnLocks === 0 && spec.startFixed === 0)).toBe(true)
    expect(specs.slice(48, 60).every((spec) => spec.fog && spec.startLocks > 0 && spec.startFixed === 0)).toBe(true)
    expect(getMergeLevel(60).title).toBe('终局·方阵归一')
    expect(getMergeLevel(13).title).toBe('定调锁阵')
  })

  it('tightens budgets across chapters above the theoretical floor', () => {
    const specs = Array.from({ length: LEVEL_COUNT }, (_, index) => getMergeLevel(index + 1))
    const slackByChapter = Array.from({ length: 5 }, (_, chapter) => {
      const sample = specs.slice(chapter * 12, chapter * 12 + 12)
      return sample.reduce((sum, spec) => sum + (spec.budget - spec.botPar) / spec.botPar, 0) / 12
    })
    for (let chapter = 1; chapter < 5; chapter += 1) {
      expect(slackByChapter[chapter]).toBeLessThan(slackByChapter[chapter - 1])
    }
    for (const spec of specs) {
      const startSum = spec.startValues.reduce((sum, value) => sum + value, 0)
      const theoryFloor = Math.max(0, Math.ceil(((spec.target - startSum) / 4) * FACTORS[spec.chapter - 1]))
      expect(spec.budget).toBeGreaterThanOrEqual(theoryFloor)
    }
    for (const spec of specs.slice(48)) {
      const slack = (spec.budget - spec.botPar) / spec.botPar
      expect(slack, `finale level ${spec.level} slack`).toBeGreaterThanOrEqual(0.15)
      // 整数步数预算向上取整,实际余量至多比计划区间多出一步
      expect(slack).toBeLessThanOrEqual(0.22 + 1 / spec.botPar)
    }
    expect(specs.every((spec) => spec.botPar > 0 && spec.botPar <= 2600)).toBe(true)
  })

  it('clamps out-of-range levels onto the valid run', () => {
    expect(getMergeLevel(0)).toEqual(getMergeLevel(1))
    expect(getMergeLevel(61)).toEqual(getMergeLevel(60))
    expect(getMergeLevel(-5).level).toBe(1)
    expect(getMergeLevel(12.9).level).toBe(12)
    expect(getMergeLevel(60).level).toBe(60)
  })
})
