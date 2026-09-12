import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../platform/rng'
import {
  assessProgress, inversionParity, isSolvable, replayWalk, scoreFor, slideBlank, slideTile,
  solvabilityClass, solvedTiles, tileIndexForArrow, tilesEqual,
} from './logic'
import { DRIFT_LEVEL_COUNT, createDriftBoard, createDriftLevel, driftChapter, scrambleSteps } from './levels'
import { getDriftRule } from './rules'

describe('number drift level generator', () => {
  it('generates sixty deterministic puzzles that replay back to their target', () => {
    for (let level = 1; level <= DRIFT_LEVEL_COUNT; level += 1) {
      const first = createDriftLevel(level)
      const second = createDriftLevel(level)
      expect(second, `level ${level} determinism`).toEqual(first)
      expect(first.board).not.toEqual(first.target)
      expect([...first.board].sort((a, b) => a - b)).toEqual([...first.target].sort((a, b) => a - b))
      expect(replayWalk(first.board, first.columns, first.walk), `level ${level} replay`).toEqual(first.target)
      expect(first.walk).toHaveLength(first.par)
    }
    const board = createDriftBoard(1)
    board[0] = 99
    expect(createDriftBoard(1)).not.toContain(99)
  })

  it('preserves the permutation parity class under every legal slide', () => {
    for (const columns of [3, 4, 5]) {
      const start = solvedTiles(columns, columns)
      expect(isSolvable(start, columns)).toBe(true)
      let tiles = start
      const random = mulberry32(columns * 977)
      for (let step = 0; step < 400; step += 1) {
        const moved = slideBlank(tiles, columns, Math.floor(random() * 4))
        if (moved) tiles = moved
        expect(solvabilityClass(tiles, columns)).toBe(solvabilityClass(start, columns))
      }
      expect(isSolvable(tiles, columns)).toBe(true)
    }
    const broken = solvedTiles(3, 3)
    ;[broken[0], broken[1]] = [broken[1], broken[0]]
    expect(inversionParity(broken)).toBe(1)
    expect(isSolvable(broken, 3)).toBe(false)
    for (let level = 1; level <= DRIFT_LEVEL_COUNT; level += 1) {
      const puzzle = createDriftLevel(level)
      expect(solvabilityClass([...puzzle.board], puzzle.columns)).toBe(solvabilityClass([...puzzle.target], puzzle.columns))
    }
  })

  it('slides only tiles adjacent to the blank without mutating the source', () => {
    const tiles = [1, 2, 3, 4, 5, 6, 7, 0, 8]
    expect(slideTile(tiles, 3, 4)).toEqual([1, 2, 3, 4, 0, 6, 7, 5, 8])
    expect(slideTile(tiles, 3, 0)).toBeNull()
    expect(slideTile(tiles, 3, 3)).toBeNull()
    expect(slideTile(tiles, 3, 5)).toBeNull()
    expect(slideTile(tiles, 3, 7)).toBeNull()
    expect(slideTile(tiles, 3, -1)).toBeNull()
    expect(slideTile(tiles, 3, 9)).toBeNull()
    const frozen = [...tiles]
    slideTile(tiles, 3, 4)
    expect(tiles).toEqual(frozen)
    const wrapped = [1, 2, 0, 3, 4, 5, 6, 7, 8]
    expect(slideTile(wrapped, 3, 3)).toBeNull()
    expect(slideBlank(wrapped, 3, 0)).toBeNull()
    expect(slideBlank(wrapped, 3, 1)).toBeNull()
    expect(slideBlank(wrapped, 3, 2)).toEqual([1, 2, 5, 3, 4, 0, 6, 7, 8])
  })

  it('maps arrow keys to the tile that slides into the blank', () => {
    const tiles = [1, 2, 3, 4, 0, 5, 6, 7, 8]
    expect(tileIndexForArrow(tiles, 3, 'ArrowUp')).toBe(7)
    expect(tileIndexForArrow(tiles, 3, 'ArrowDown')).toBe(1)
    expect(tileIndexForArrow(tiles, 3, 'ArrowLeft')).toBe(5)
    expect(tileIndexForArrow(tiles, 3, 'ArrowRight')).toBe(3)
    expect(tileIndexForArrow(tiles, 3, 'w')).toBe(7)
    expect(tileIndexForArrow(tiles, 3, 'd')).toBe(3)
    expect(tileIndexForArrow(tiles, 3, 'x')).toBe(-1)
    const edge = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    expect(tileIndexForArrow(edge, 3, 'ArrowRight')).toBe(-1)
    expect(tileIndexForArrow(edge, 3, 'ArrowDown')).toBe(-1)
    expect(tileIndexForArrow(edge, 3, 'ArrowLeft')).toBe(1)
  })

  it('fails only when the budget is exhausted without reaching the target', () => {
    const target = [1, 2, 3, 4, 5, 6, 7, 8, 0]
    expect(assessProgress(target, target, 10, 10)).toEqual({ completed: true, failed: false })
    expect(assessProgress([2, 1, 3, 4, 5, 6, 7, 8, 0], target, 10, 10)).toEqual({ completed: false, failed: true })
    expect(assessProgress([2, 1, 3, 4, 5, 6, 7, 8, 0], target, 9, 10)).toEqual({ completed: false, failed: false })
    expect(assessProgress([2, 1, 3, 4, 5, 6, 7, 8, 0], target, 999)).toEqual({ completed: false, failed: false })
  })

  it('scores 1000 at par minus overage and fog peeks, floored at 100', () => {
    expect(scoreFor(40, 40)).toBe(1000)
    expect(scoreFor(0, 40)).toBe(1000)
    expect(scoreFor(45, 40)).toBe(960)
    expect(scoreFor(40, 40, 2)).toBe(940)
    expect(scoreFor(200, 40, 9)).toBe(100)
  })

  it('escalates five chapters with tighter budgets and fog combos', () => {
    expect(driftChapter(11)).toBe(1)
    expect(driftChapter(12)).toBe(2)
    expect(driftChapter(23)).toBe(3)
    expect(driftChapter(34)).toBe(4)
    expect(driftChapter(45)).toBe(5)
    const levels = Array.from({ length: DRIFT_LEVEL_COUNT }, (_, index) => createDriftLevel(index + 1))
    expect(levels[0].columns).toBe(3)
    expect(levels[11].columns).toBe(4)
    expect(levels[22].columns).toBe(4)
    expect(levels[33].columns).toBe(5)
    expect(levels[59].columns).toBe(5)
    expect(levels.slice(0, 22).every((level) => !level.fog)).toBe(true)
    expect(levels.slice(22, 33).every((level) => level.fog)).toBe(true)
    expect(levels.slice(33, 44).every((level) => !level.fog)).toBe(true)
    expect(levels.slice(44).every((level) => level.fog)).toBe(true)
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].par, `level ${index + 1} par curve`).toBeGreaterThanOrEqual(levels[index - 1].par)
    }
    expect(scrambleSteps(11)).toBeLessThan(scrambleSteps(12))
    expect(scrambleSteps(22)).toBeLessThan(scrambleSteps(23))
    expect(scrambleSteps(33)).toBeLessThan(scrambleSteps(34))
    expect(scrambleSteps(44)).toBeLessThan(scrambleSteps(45))
    expect(scrambleSteps(1)).toBe(20)
    expect(scrambleSteps(22)).toBe(120)
    expect(scrambleSteps(44)).toBe(260)
    const budget = getDriftRule(levels[21])
    const tight = getDriftRule(levels[22])
    const wide = getDriftRule(levels[33])
    expect(budget.moveLimit).toBe(Math.ceil(levels[21].par * 1.15))
    expect(tight.moveLimit).toBe(Math.ceil(levels[22].par * 1.08))
    expect(tight.moveLimit!).toBeLessThan(Math.ceil(levels[22].par * 1.15))
    expect(wide.moveLimit).toBeUndefined()
    for (const level of levels.filter((item) => item.fog)) {
      expect(tilesEqual([...level.target], [...solvedTiles(level.columns, level.rows)])).toBe(false)
    }
    const finale = getDriftRule(levels[59])
    expect(finale.mode).toBe('gauntlet')
    expect(finale.fog).toBe(true)
    expect(finale.moveLimit).toBeDefined()
    expect(finale.peekPenalty).toBe(30)
  })
})
