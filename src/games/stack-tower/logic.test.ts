import { describe, expect, it, vi } from 'vitest'
import {
  ALL_KINDS, COLS, EMPTY, GARBAGE, ICE, ROWS, STACK, castReforge, collides, createTowerState, emptyGrid, hardDrop,
  lineScore, movePiece, rotatePiece, shapeAt, softDrop, type Cell, type Grid, type PieceKind, type TowerPlan, type TowerState,
} from './logic'
import { CHAPTER_STARTS, LEVEL_COUNT, getTowerLevel, validateLevel } from './levels'

const plan = (level: number) => getTowerLevel(level)
const planOf = (grid: Grid, sequence: PieceKind[], goal: number, tier = 1, reforges = 0): TowerPlan => ({ grid, sequence, goal, tier, reforges })

const gridOf = (...patterns: string[]): Grid => {
  const grid = emptyGrid()
  patterns.forEach((pattern, index) => {
    grid[ROWS - patterns.length + index] = pattern.split('').map((ch) => (ch === 'X' ? STACK : ch === 'G' ? GARBAGE : EMPTY) as Cell)
  })
  return grid
}

const pieceAt = (state: TowerState, kind: PieceKind, rot: number, x: number, y: number): TowerState =>
  ({ ...state, piece: { kind, rot, x, y } })

const run = (state: TowerState, action: (current: TowerState) => TowerState, guard = 40): TowerState => {
  let current = state
  for (let index = 0; index < guard && current.status === 'playing'; index += 1) current = action(current)
  return current
}

describe('stack-tower rotation', () => {
  it('kicks rotations off walls and floors without clipping', () => {
    const state = createTowerState(planOf(emptyGrid(), ['I'], 99))
    const walled = rotatePiece(pieceAt(state, 'I', 1, COLS - 3, 5))
    expect(walled.piece.rot).toBe(2)
    expect(walled.piece.x).toBe(COLS - 4)
    const floored = rotatePiece(pieceAt(state, 'T', 0, 3, ROWS - 2))
    expect(floored.piece.rot).toBe(1)
    expect(floored.piece.y).toBe(ROWS - 3)
  })

  it('never leaves an invalid placement and stays put when every kick is blocked', () => {
    const pocket = gridOf('XXXXXXXXXX', 'XXXX.XXXXX', 'XXX...XXXX', 'XXXXXXXXXX')
    const base = pieceAt(createTowerState(planOf(emptyGrid(), ['T'], 99)), 'T', 0, 3, ROWS - 4)
    const target = { ...base, grid: pocket }
    const trapped = rotatePiece(target)
    expect(trapped).toBe(target)
    expect(trapped.piece.rot).toBe(0)
    const sweep = (grid: Grid) => {
      for (const kind of ALL_KINDS) {
        for (let rot = 0; rot < 4; rot += 1) {
          for (const x of [-1, 0, 1, COLS - 2, COLS - 1, COLS]) {
            for (const y of [-1, 0, ROWS - 3, ROWS - 2, ROWS - 1]) {
              const target = pieceAt({ ...base, grid }, kind, rot, x, y)
              const next = rotatePiece(target)
              const valid = !collides(next.grid, shapeAt(next.piece), next.piece.x, next.piece.y)
              expect(next === target || valid).toBe(true)
            }
          }
        }
      }
    }
    sweep(emptyGrid())
    sweep(gridOf('G.X..G..X.', 'XXGXX.XXGX'))
  })
})

describe('stack-tower line clears', () => {
  it('scores 100/300/500/800 by tier and only counts pure rows toward the goal', () => {
    expect([100, 300, 500, 800]).toEqual([lineScore(1, 1), lineScore(2, 1), lineScore(3, 1), lineScore(4, 1)])
    expect(lineScore(1, 4)).toBe(400)
    const grid = gridOf('X.........', 'XXXX..XXXX', 'XXXX..XXGG')
    const won = hardDrop(createTowerState(planOf(grid, ['O'], 1, 3)))
    expect(won.status).toBe('won')
    expect(won.cleared).toBe(1)
    expect(won.score).toBe(900)
    expect(won.grid[ROWS - 1][0]).toBe(STACK)
    expect(won.grid[ROWS - 1][1]).toBe(EMPTY)
    expect(won.grid[ROWS - 2].every((cell) => cell === EMPTY)).toBe(true)
    const grinding = hardDrop(createTowerState(planOf(grid, ['O', 'O'], 2, 3)))
    expect(grinding.status).toBe('playing')
    expect(grinding.cleared).toBe(1)
  })

  it('wins on the goal, loses on overflow, spawn block and exhausted budgets', () => {
    const winner = hardDrop(createTowerState(planOf(gridOf('XXX....XXX'), ['I'], 1, 2)))
    expect(winner.status).toBe('won')
    expect(winner.score).toBe(lineScore(1, 2))
    const tall = emptyGrid()
    for (let row = 2; row < ROWS; row += 1) tall[row] = tall[row].map(() => STACK as Cell)
    const overflow = createTowerState(planOf(tall, ['I'], 99))
    expect(overflow.status).toBe('playing')
    const kicked = rotatePiece(overflow)
    expect(kicked.piece.y).toBe(-2)
    const lost = softDrop(kicked)
    expect(lost.status).toBe('lost')
    expect(lost.events).toContain('lose')
    const roof = emptyGrid()
    roof[0] = roof[0].map(() => STACK as Cell)
    roof[1] = roof[1].map(() => STACK as Cell)
    const blocked = createTowerState(planOf(roof, ['T'], 1))
    expect(blocked.status).toBe('lost')
    const budgeted = run(createTowerState(planOf(emptyGrid(), ['O', 'O', 'O'], 50)), hardDrop)
    expect(budgeted.status).toBe('lost')
    expect(budgeted.nextIndex).toBe(3)
    expect(budgeted.cleared).toBeLessThan(50)
  })
})

describe('stack-tower event hygiene', () => {
  it('returns empty event lists on event-less actions so stale sounds never replay', () => {
    const state = createTowerState(planOf(emptyGrid(), ['T', 'T', 'T'], 99))
    const locked = hardDrop(state)
    expect(locked.events).toContain('lock')
    const moved = movePiece(locked, 1)
    expect(moved.events).toEqual([])
    const nudged = softDrop(moved)
    expect(nudged.events).toEqual([])
    const spun = rotatePiece(moved)
    expect(spun.events).toEqual(['rotate'])
    expect(softDrop(spun).events).toEqual([])
  })
})

describe('stack-tower ice rows', () => {
  it('holds a frozen row until the row above it clears, then releases it one lock later', () => {
    const grid = emptyGrid()
    grid[ROWS - 3] = Array.from({ length: COLS }, () => ICE as Cell)
    let state = createTowerState(planOf(grid, ['O', 'O', 'O', 'O', 'O', 'O', 'O'], 4, 2))
    for (const dx of [-4, -2, 0, 2, 4]) {
      state = movePiece(state, dx)
      state = hardDrop(state)
    }
    expect(state.status).toBe('playing')
    expect(state.cleared).toBe(2)
    expect(state.events).toContain('clear')
    expect(state.events).toContain('melt')
    expect(state.grid[ROWS - 3].every((cell) => cell === STACK)).toBe(true)
    expect(state.grid.some((row) => row.some((cell) => cell === ICE))).toBe(false)
    state = hardDrop(state)
    expect(state.cleared).toBe(3)
    expect(state.events).toContain('clear')
    expect(state.events).not.toContain('melt')
  })

  it('never clears or scores the frozen row itself while ice remains', () => {
    const grid = emptyGrid()
    grid[ROWS - 3] = Array.from({ length: COLS }, () => ICE as Cell)
    const state = createTowerState(planOf(grid, ['O', 'O'], 99, 2))
    const dropped = hardDrop(state)
    expect(dropped.status).toBe('playing')
    expect(dropped.cleared).toBe(0)
    expect(dropped.score).toBe(0)
    expect(dropped.grid[ROWS - 3].every((cell) => cell === ICE)).toBe(true)
    expect(collides(grid, shapeAt({ kind: 'O', rot: 0, x: 4, y: ROWS - 3 }), 4, ROWS - 3)).toBe(true)
  })
})

describe('stack-tower reforge', () => {
  it('clears the bottom row once, shifts the stack down and never scores', () => {
    const state = createTowerState(planOf(gridOf('X.........', 'XXGXXXXGXX'), ['O', 'O'], 99, 1, 1))
    const reforged = castReforge(state)
    expect(reforged.status).toBe('playing')
    expect(reforged.reforges).toBe(0)
    expect(reforged.score).toBe(0)
    expect(reforged.cleared).toBe(0)
    expect(reforged.events).toEqual(['reforge'])
    expect(reforged.grid[ROWS - 1].every((cell) => cell === EMPTY)).toBe(false)
    expect(reforged.grid[ROWS - 1][2]).toBe(EMPTY)
    expect(reforged.grid[ROWS - 1][0]).toBe(STACK)
    expect(reforged.grid[ROWS - 2].every((cell) => cell === EMPTY)).toBe(true)
    expect(castReforge(reforged)).toBe(reforged)
    expect(castReforge(createTowerState(planOf(emptyGrid(), ['O'], 99)))).toMatchObject({ reforges: 0 })
  })
})

describe('stack-tower level determinism', () => {
  it('builds sixty byte-identical seeded levels with budgeted bag sequences', () => {
    const signatures = new Set<string>()
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const spec = plan(level)
      expect(JSON.stringify(spec)).toBe(JSON.stringify(plan(level)))
      expect(validateLevel(spec)).toBeNull()
      const counts = new Map<string, number>()
      for (const kind of spec.sequence) counts.set(kind, (counts.get(kind) ?? 0) + 1)
      const values = [...counts.values()]
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2)
      signatures.add(`${spec.pieceSet.join('')}:${spec.sequence.join('')}:${spec.grid.flat().join('')}`)
    }
    expect(signatures.size).toBeGreaterThanOrEqual(56)
  })

  it('regenerates identical levels in a fresh module registry', async () => {
    vi.resetModules()
    const { getTowerLevel: fresh } = await import('./levels')
    for (const level of [1, 12, 27, 40, 53, 60]) {
      expect(JSON.stringify(fresh(level))).toBe(JSON.stringify(plan(level)))
    }
  })
})

describe('stack-tower difficulty curve', () => {
  it('escalates chapters: goal, speed, garbage, limited sets and the finale combo', () => {
    for (let chapter = 1; chapter <= CHAPTER_STARTS.length; chapter += 1) {
      expect(plan(CHAPTER_STARTS[chapter - 1]).chapter).toBe(chapter)
    }
    expect(plan(1).goal).toBe(6)
    expect(plan(12).goal).toBe(10)
    expect(plan(1).garbageRows).toBe(0)
    expect(plan(12).iceRow).toBeGreaterThanOrEqual(0)
    expect(plan(12).grid[plan(12).iceRow].every((cell) => cell === ICE)).toBe(true)
    expect(plan(22).iceRow).toBeGreaterThanOrEqual(0)
    for (const level of [1, 23, 45]) expect(plan(level).iceRow).toBe(-1)
    expect(plan(23).garbageRows).toBeGreaterThan(0)
    expect(plan(34).pieceSet.length).toBe(5)
    expect(plan(34).garbageRows).toBeGreaterThan(0)
    expect(plan(45).reforges).toBe(1)
    expect(plan(45).garbageRows).toBeGreaterThan(0)
    expect(plan(60).reforges).toBe(1)
    expect(plan(60).title).toContain('终局')
    for (const level of [1, 11, 22, 33, 44]) expect(plan(level).reforges).toBe(0)
    for (let level = 1; level < LEVEL_COUNT; level += 1) {
      expect(plan(level + 1).dropMs).toBeLessThanOrEqual(plan(level).dropMs)
      expect(plan(level).pieceSet.length).toBe(plan(level).chapter >= 4 ? 5 : 7)
    }
    expect(plan(60).dropMs).toBeLessThan(plan(1).dropMs)
  })

  it('rejects corrupted level specs and clamps boundary inputs', () => {
    expect(validateLevel({ ...plan(1), dropMs: 50 })).toBe('speed out of range')
    expect(validateLevel({ ...plan(1), budget: 5 })).toBe('budget mismatch')
    expect(validateLevel({ ...plan(23), garbageRows: ROWS - 2 })).toBe('too much garbage')
    expect(JSON.stringify(plan(0))).toBe(JSON.stringify(plan(1)))
    expect(JSON.stringify(plan(999))).toBe(JSON.stringify(plan(60)))
    expect(JSON.stringify(plan(Number.NaN))).toBe(JSON.stringify(plan(1)))
  })

  it('enforces structural reachability: I supply, drainable hole spans and chapter 2 ice', () => {
    const withoutI = { ...plan(23), sequence: plan(23).sequence.map((kind) => (kind === 'I' ? ('O' as const) : kind)) }
    expect(validateLevel(withoutI)).toBe('sequence lacks I pieces')
    const narrow = plan(23).grid.map((row, index) => {
      if (index < ROWS - plan(23).garbageRows) return row
      const next = row.map(() => GARBAGE as Cell)
      next[3] = EMPTY as Cell
      next[5] = EMPTY as Cell
      return next
    })
    expect(validateLevel({ ...plan(23), grid: narrow })).toBe('garbage hole too narrow')
    const melted = plan(12).grid.map((row, index) => (index === plan(12).iceRow ? row.map(() => EMPTY as Cell) : row))
    expect(validateLevel({ ...plan(12), grid: melted })).toBe('chapter 2 needs exactly one full ice row')
    const frosted = plan(1).grid.map((row, index) => (index === 5 ? row.map(() => ICE as Cell) : row))
    expect(validateLevel({ ...plan(1), grid: frosted })).toBe('ice rows only belong to chapter 2')
  })
})

describe('stack-tower boundaries', () => {
  it('rejects illegal moves, merges locks and freezes terminal states', () => {
    const state = createTowerState(planOf(emptyGrid(), ['T', 'T'], 99))
    expect(movePiece(state, -4)).toBe(state)
    expect(movePiece(state, 8)).toBe(state)
    expect(movePiece(state, 1.5)).toBe(state)
    expect(softDrop(state).piece.y).toBe(state.piece.y + 1)
    const locked = hardDrop(state)
    expect(locked.grid[ROWS - 1].some((cell) => cell === STACK)).toBe(true)
    expect(locked.nextIndex).toBe(1)
    expect(locked.status).toBe('playing')
    const won: TowerState = { ...state, status: 'won' }
    expect(softDrop(won)).toBe(won)
    expect(hardDrop(won)).toBe(won)
    expect(rotatePiece(won)).toBe(won)
    expect(movePiece(won, 1)).toBe(won)
    expect(castReforge(won)).toBe(won)
  })
})
