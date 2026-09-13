import { describe, expect, it } from 'vitest'
import { bfsMinTurns, cellKey, manhattan, sameCell, simulateRun, stepBall, type BallState } from './logic'
import { createMagnetLevel, getMagnetSpec } from './levels'

const ALL = Array.from({ length: 60 }, (_, index) => createMagnetLevel(index + 1))
const inGrid = (size: number, row: number, col: number) => row >= 0 && col >= 0 && row < size && col < size
const chapterLevels = (chapter: number) => ALL.filter((_, index) => getMagnetSpec(index + 1).chapter === chapter)
const long = { timeout: 180000 }

describe('magnet path level system', () => {
  it('generates sixty deterministic boards with sound geometry', long, () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = createMagnetLevel(level)
      expect(first).toEqual(ALL[level - 1])
      const spec = getMagnetSpec(level)
      const reserved = new Set([cellKey(first.start.row, first.start.col), ...first.holes.map((hole) => cellKey(hole.row, hole.col)), ...first.walls.map((wall) => cellKey(wall.row, wall.col))])
      expect(first.holes).toHaveLength(spec.holeCount)
      expect(new Set(first.holes.map((hole) => cellKey(hole.row, hole.col))).size).toBe(first.holes.length)
      expect(manhattan(first.holes[0], first.start)).toBe(spec.reach)
      if (first.holes.length > 1) {
        expect(manhattan(first.holes[1], first.holes[0])).toBe(spec.reach)
        expect(first.holes[1].row).not.toBe(first.holes[0].row)
        expect(first.holes[1].col).not.toBe(first.holes[0].col)
      }
      first.solution.forEach((magnet) => expect(reserved.has(cellKey(magnet.row, magnet.col)), `level ${level} magnet on reserve`).toBe(false))
      expect(first.solution.length).toBeGreaterThan(0)
      expect(first.solution.length).toBeLessThanOrEqual(first.capacity)
      expect(first.capacity).toBe(spec.capacity)
      expect(first.budget).toBe(first.par + spec.slack)
      expect(first.par).toBeGreaterThanOrEqual(spec.reach)
      expect(first.solution.every((magnet) => inGrid(first.size, magnet.row, magnet.col))).toBe(true)
    }
    expect(new Set(ALL.map((entry) => `${entry.start.row}.${entry.start.col}|${entry.holes.map((hole) => `${hole.row}.${hole.col}`).join(',')}`)).size).toBeGreaterThan(50)
  })

  it('replays every stored solution onto its holes within par and budget', () => {
    for (const [index, entry] of ALL.entries()) {
      const run = simulateRun(entry, entry.start, entry.solution)
      expect(run.won, `level ${index + 1} replay`).toBe(true)
      expect(run.turns).toBe(entry.par)
      expect(entry.par).toBeLessThan(entry.budget)
      expect(bfsMinTurns(entry, entry.start, entry.solution)).toBe(entry.par)
      const dead = simulateRun(entry, entry.start, [])
      expect(dead.won, `level ${index + 1} needs magnets`).toBe(false)
    }
  })

  it('keeps chapter five holes strictly ordered during replay', () => {
    for (const entry of chapterLevels(5)) {
      expect(entry.holes).toHaveLength(2)
      let ball: BallState = { row: entry.start.row, col: entry.start.col, filled: 0 }
      let firstEntry = -1
      for (let turn = 0; turn < entry.par; turn += 1) {
        ball = stepBall(entry, ball, entry.solution)
        if (ball.filled === 1 && firstEntry < 0) {
          firstEntry = turn
          expect(sameCell(entry.holes[0], ball)).toBe(true)
        }
      }
      expect(firstEntry).toBeGreaterThanOrEqual(0)
      expect(ball.filled).toBe(2)
      expect(sameCell(entry.holes[1], ball)).toBe(true)
    }
    expect(chapterLevels(1).every((entry) => entry.holes.length === 1)).toBe(true)
  })

  it('locks the chapter ladder: size, capacity, walls, slack and exact par ramp', () => {
    expect([1, 12, 23, 34, 45].map((level) => getMagnetSpec(level).chapter)).toEqual([1, 2, 3, 4, 5])
    expect([1, 12, 23, 34, 45].map((level) => getMagnetSpec(level).size)).toEqual([6, 7, 8, 8, 9])
    expect([1, 12, 23, 34, 45].map((level) => getMagnetSpec(level).capacity)).toEqual([2, 3, 3, 4, 5])
    expect([1, 12, 23, 34, 45].map((level) => getMagnetSpec(level).reach)).toEqual([4, 5, 6, 7, 4])
    expect(getMagnetSpec(1).walls).toBe(0)
    expect(getMagnetSpec(12).walls).toBe(0)
    expect(getMagnetSpec(23).walls).toBeGreaterThan(0)
    expect(getMagnetSpec(45).walls).toBeGreaterThan(getMagnetSpec(34).walls)
    expect(getMagnetSpec(1).slack).toBeGreaterThan(getMagnetSpec(34).slack)
    const pars = (chapter: number) => chapterLevels(chapter).map((entry) => entry.par)
    expect(pars(1)).toEqual([4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5])
    expect(pars(2)).toEqual([5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6])
    expect(pars(3)).toEqual([6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7])
    expect(pars(4)).toEqual([7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8])
    expect(pars(5)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 10, 10, 10])
    expect(Math.min(...pars(5))).toBeGreaterThan(Math.min(...pars(4)))
    expect(Math.min(...pars(4))).toBeGreaterThan(Math.min(...pars(3)))
    expect(Math.min(...pars(3))).toBeGreaterThan(Math.min(...pars(2)))
    expect(Math.min(...pars(2))).toBeGreaterThan(Math.min(...pars(1)))
    expect(Math.max(...pars(5))).toBeGreaterThan(Math.max(...pars(1)))
  })

  it('clamps out-of-range levels onto the deterministic ladder', () => {
    expect(getMagnetSpec(0).level).toBe(1)
    expect(getMagnetSpec(999).level).toBe(60)
    expect(getMagnetSpec(7.8).level).toBe(7)
    expect(createMagnetLevel(0)).toEqual(ALL[0])
    expect(createMagnetLevel(-3)).toEqual(ALL[0])
    expect(createMagnetLevel(999)).toEqual(ALL[59])
    expect(createMagnetLevel(7.8)).toEqual(ALL[6])
    expect(getMagnetSpec(60).title).toContain('终局')
  })
})
