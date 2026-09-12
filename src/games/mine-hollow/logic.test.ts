import { describe, expect, it } from 'vitest'
import { boardSeed, createBoard, layoutMines, neighborIndices, primeBoard, revealAt, safeZone, scoreFor, toggleFlag, type MineBoard } from './logic'
import { chapterOf, getMineLevel, MINE_LEVEL_COUNT } from './levels'

const probes = (rows: number, columns: number) => [0, columns - 1, rows * columns - 1, Math.floor((rows * columns) / 2), Math.floor(rows / 2) * columns + Math.floor(columns / 3)]

const countMines = (board: MineBoard, index: number) => neighborIndices(index, board.rows, board.columns).reduce((sum, n) => sum + (board.cells[n].mine ? 1 : 0), 0)

const chapterLevels = (chapter: number) => {
  const start = [1, 12, 23, 34, 45][chapter - 1]
  const size = [11, 11, 11, 11, 16][chapter - 1]
  return Array.from({ length: size }, (_, index) => getMineLevel(start + index))
}

describe('mine hollow level system', () => {
  it('keeps every first click safe across all sixty levels', () => {
    for (let level = 1; level <= MINE_LEVEL_COUNT; level += 1) {
      const spec = getMineLevel(level)
      const blank = createBoard(spec)
      for (const probe of probes(spec.rows, spec.columns)) {
        const primed = primeBoard(blank, probe, boardSeed(level, probe))
        const zone = safeZone(probe, spec.rows, spec.columns, spec.safeRadius)
        zone.forEach((index) => expect(primed.cells[index].mine).toBe(false))
        expect(primed.cells[probe].count).toBe(0)
        expect(primed.phase).toBe('playing')
      }
    }
  })

  it('lays the exact mine count with consistent neighbor numbers', () => {
    for (let level = 1; level <= MINE_LEVEL_COUNT; level += 1) {
      const spec = getMineLevel(level)
      const primed = primeBoard(createBoard(spec), 0, boardSeed(level, 0))
      expect(primed.cells).toHaveLength(spec.rows * spec.columns)
      expect(primed.cells.filter((cell) => cell.mine)).toHaveLength(spec.mines)
      primed.cells.forEach((cell, index) => expect(cell.count).toBe(countMines(primed, index)))
    }
  })

  it('floods the connected zero region without touching flagged or mined cells', () => {
    const counts = [1, 2, 2, 1, 1, 0, 0, 1, 1, 2, 2, 1, 0, 0, 0, 0]
    const cells = counts.map((count, index) => ({ mine: index === 5 || index === 6, count, revealed: false, flagged: false }))
    const board: MineBoard = { rows: 4, columns: 4, mineCount: 2, safeRadius: 1, cells, phase: 'playing', flags: 0, firstIndex: null, opened: [] }
    const flooded = revealAt(board, 12)
    expect(flooded.phase).toBe('playing')
    expect(flooded.cells.filter((cell) => cell.revealed)).toHaveLength(8)
    expect(flooded.cells[5].revealed).toBe(false)
    expect(flooded.cells[6].revealed).toBe(false)
    flooded.cells.forEach((cell, index) => {
      if (cell.revealed && cell.count === 0) neighborIndices(index, 4, 4).forEach((n) => expect(flooded.cells[n].revealed).toBe(true))
    })
    const seen = new Set([12])
    const queue = [12]
    while (queue.length) {
      const current = queue.pop() as number
      for (const next of neighborIndices(current, 4, 4)) {
        if (flooded.cells[next].revealed && !seen.has(next)) { seen.add(next); queue.push(next) }
      }
    }
    expect(seen.size).toBe(flooded.cells.filter((cell) => cell.revealed).length)
    expect(revealAt(flooded, 12)).toBe(flooded)
    const won = { ...flooded, phase: 'won' as const }
    expect(revealAt(won, 0)).toBe(won)
    const exploded = revealAt(flooded, 5)
    expect(exploded.phase).toBe('lost')
    expect(exploded.cells[6].revealed).toBe(true)
  })

  it('replays identical boards from the same level and first click', () => {
    for (const level of [1, 27, 45, 60]) {
      const spec = getMineLevel(level)
      const first = primeBoard(createBoard(spec), 20, boardSeed(level, 20))
      const second = primeBoard(createBoard(spec), 20, boardSeed(level, 20))
      expect(first.cells.map((cell) => (cell.mine ? 1 : 0))).toEqual(second.cells.map((cell) => (cell.mine ? 1 : 0)))
      expect(first.cells.map((cell) => cell.count)).toEqual(second.cells.map((cell) => cell.count))
      const layout = first.cells.map((cell) => (cell.mine ? 1 : 0)).join('')
      const other = primeBoard(createBoard(spec), 21, boardSeed(level, 21))
      expect(other.cells.map((cell) => (cell.mine ? 1 : 0)).join('')).not.toBe(layout)
    }
    expect(layoutMines(6, 6, 3, 0, 1, boardSeed(3, 0))).toEqual(layoutMines(6, 6, 3, 0, 1, boardSeed(3, 0)))
  })

  it('tightens density, par and safety expansion across five chapters', () => {
    for (let chapter = 1; chapter <= 5; chapter += 1) {
      const levels = chapterLevels(chapter)
      expect(levels.every((spec) => spec.chapter === chapter && chapterOf(spec.level) === chapter)).toBe(true)
      for (let index = 1; index < levels.length; index += 1) expect(levels[index].mines).toBeGreaterThanOrEqual(levels[index - 1].mines)
      const density = levels.reduce((sum, spec) => sum + spec.mines / (spec.rows * spec.columns), 0) / levels.length
      if (chapter > 1) {
        const previous = chapterLevels(chapter - 1)
        const previousDensity = previous.reduce((sum, spec) => sum + spec.mines / (spec.rows * spec.columns), 0) / previous.length
        expect(density).toBeGreaterThan(previousDensity)
      }
    }
    expect(getMineLevel(60).par).toBeLessThan(getMineLevel(45).par)
    expect(getMineLevel(45).par).toBeLessThanOrEqual(420)
    expect(getMineLevel(45).safeRadius).toBe(2)
    expect(getMineLevel(1).safeRadius).toBe(1)
    expect(getMineLevel(1).timer).toBe(false)
    expect(getMineLevel(12).timer).toBe(true)
    expect(getMineLevel(34).flagBonus).toBe(150)
    expect(getMineLevel(33).flagBonus).toBe(0)
  })

  it('scores time over par and honours the flag-free bonus', () => {
    const plain = { par: 60, flagBonus: 0 }
    expect(scoreFor(30, plain, false)).toBe(1000)
    expect(scoreFor(95, plain, false)).toBe(970)
    expect(scoreFor(2000, plain, false)).toBe(100)
    const challenge = { par: 60, flagBonus: 150 }
    expect(scoreFor(45, challenge, false)).toBe(1150)
    expect(scoreFor(45, challenge, true)).toBe(1000)
  })

  it('guards boundaries and no-op interactions', () => {
    expect(getMineLevel(0).level).toBe(1)
    expect(getMineLevel(99).level).toBe(MINE_LEVEL_COUNT)
    expect(getMineLevel(Number.NaN).level).toBe(1)
    expect(getMineLevel(12.7).level).toBe(12)
    const spec = getMineLevel(5)
    const idle = createBoard(spec)
    const flagOnce = toggleFlag(idle, 3)
    expect(flagOnce.flags).toBe(1)
    expect(toggleFlag(flagOnce, 3).flags).toBe(0)
    expect(revealAt(flagOnce, 3)).toBe(flagOnce)
    const primed = primeBoard(createBoard(spec), 10, boardSeed(5, 10))
    const guarded = revealAt(toggleFlag(primed, 4), 10)
    expect(guarded.cells[4].flagged).toBe(true)
    expect(guarded.cells[4].revealed).toBe(false)
    const revealed = revealAt(primed, 10)
    expect(revealed.cells[10].revealed).toBe(true)
    expect(toggleFlag(revealed, 10)).toBe(revealed)
    const mineIndex = primed.cells.findIndex((cell) => cell.mine)
    const lost = revealAt(primed, mineIndex)
    expect(lost.phase).toBe('lost')
    expect(toggleFlag(lost, 0)).toBe(lost)
  })
})
