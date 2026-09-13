import { describe, expect, it } from 'vitest'
import {
  applyPlace, applyRemove, applyRotate, blockCells, createTangramState, judgeTangram,
  MAX_MISSES, normalize, orientCells, orientationSet, rotateCells, scoreFor, shapeCandidates, type Cells, type TangramBlock, type TangramSpec,
} from './logic'
import { buildStripPuzzle, buildTangramPuzzle } from './generate'

const block = (id: number, base: Cells): TangramBlock => ({ id, family: 'I', size: base.length, base, orientation: 0, color: id })

const spec: TangramSpec = {
  rows: 2,
  cols: 2,
  blocks: [block(0, [[0, 0], [0, 1]]), block(1, [[0, 0], [0, 1]])],
  fixed: [],
  solution: [0, 2],
  solOrientations: [0, 0],
  par: 2,
  rotateLocked: false,
}

describe('tangram rotation semantics', () => {
  it('rotates clockwise with four-step identity and clamped orientation counts', () => {
    const line: Cells = [[0, 0], [0, 1], [0, 2]]
    expect(rotateCells(line)).toEqual(normalize([[0, 0], [1, 0], [2, 0]]))
    let cells = line
    for (let step = 0; step < 4; step += 1) cells = rotateCells(cells)
    expect(cells).toEqual(line)
    const ell: Cells = [[0, 0], [1, 0], [1, 1]]
    expect(rotateCells(ell)).toEqual([[0, 0], [0, 1], [1, 0]])
    expect(orientCells(line, 5)).toEqual(orientCells(line, 1))
    expect(orientCells(line, -3)).toEqual(orientCells(line, 1))
    expect(orientCells(line, 0)).toEqual(line)
  })

  it('keeps S and Z mirror-distinct because flips are not moves', () => {
    const sBase = shapeCandidates('S', 4, 6, 6)[0].base
    const zBase = shapeCandidates('Z', 4, 6, 6)[0].base
    expect(sBase).not.toEqual(zBase)
    const sTurns = orientationSet(sBase).map((cells) => JSON.stringify(cells))
    const zTurns = orientationSet(zBase).map((cells) => JSON.stringify(cells))
    expect(sTurns).toHaveLength(2)
    expect(zTurns).toHaveLength(2)
    for (const key of sTurns) expect(zTurns).not.toContain(key)
    expect(orientationSet([[0, 0], [0, 1], [1, 0], [1, 1]])).toHaveLength(1)
    expect(orientationSet([[0, 0], [0, 1], [0, 2]])).toHaveLength(2)
    expect(orientationSet([[0, 0], [1, 0], [2, 0], [2, 1]])).toHaveLength(4)
  })

  it('prunes library entries that cannot fit the board', () => {
    expect(shapeCandidates('I', 6, 5, 5)).toHaveLength(0)
    expect(shapeCandidates('I', 5, 5, 5)).toHaveLength(1)
    expect(shapeCandidates('T', 3, 5, 5)).toHaveLength(0)
    expect(shapeCandidates('T', 4, 5, 5)).toHaveLength(1)
    expect(shapeCandidates('L', 9, 5, 5)).toHaveLength(1)
    expect(shapeCandidates('L', 8, 5, 5).map((pick) => pick.base.length)).toEqual([8, 8])
    expect(shapeCandidates('O', 9, 5, 5)[0].base).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]])
    expect(shapeCandidates('Z', 5, 6, 6)).toHaveLength(0)
    expect(blockCells(block(0, [[0, 0], [0, 1]]), 1)).toEqual([[0, 0], [1, 0]])
  })
})

describe('tangram validator invariants', () => {
  it('detects overlap, overflow and unfilled cells without declaring false wins', () => {
    const orientations = spec.blocks.map(() => 0)
    expect(judgeTangram(2, 2, spec.blocks, orientations, [0, 2]).solved).toBe(true)
    const clashing = judgeTangram(2, 2, spec.blocks, [0, 1], [0, 0])
    expect(clashing.overlap).toBe(true)
    expect(clashing.overflow).toBe(false)
    expect(clashing.covered).toBe(3)
    expect(clashing.solved).toBe(false)
    const outside = judgeTangram(2, 2, spec.blocks, [0, 1], [0, 2])
    expect(outside.overflow).toBe(true)
    expect(outside.solved).toBe(false)
    const partial = judgeTangram(2, 2, spec.blocks, orientations, [0, null])
    expect(partial.placed).toBe(1)
    expect(partial.solved).toBe(false)
    const stray = judgeTangram(2, 2, spec.blocks, orientations, [0, 3])
    expect(stray.overflow).toBe(true)
    expect(stray.covered).toBe(3)
  })

  it('charges one miss per illegal drop and never mutates the board on it', () => {
    let state = createTangramState(spec)
    const first = applyPlace(spec, state, 0, 1)
    expect(first.applied).toBe(false)
    expect(first.state.misses).toBe(1)
    expect(first.state.placements).toEqual([null, null])
    expect(first.state.ops).toBe(0)
    state = first.state
    const second = applyPlace(spec, state, 0, 3)
    expect(second.applied).toBe(false)
    expect(second.state.misses).toBe(2)
    const good = applyPlace(spec, state, 0, 0)
    expect(good.applied).toBe(true)
    expect(good.state.ops).toBe(1)
    expect(good.state.placements).toEqual([0, null])
    expect(applyPlace(spec, good.state, 0, 2).applied).toBe(false)
    expect(applyPlace(spec, good.state, 0, 2).state.misses).toBe(good.state.misses)
    const spent = applyPlace(spec, second.state, 1, 1)
    expect(spent.state.misses).toBe(MAX_MISSES)
  })

  it('gates rotation by lock, placement and fixed state, wrapping mod 4', () => {
    const locked: TangramSpec = { ...spec, rotateLocked: true }
    expect(applyRotate(locked, createTangramState(locked), 0).applied).toBe(false)
    const pinned: TangramSpec = { ...spec, fixed: [1] }
    expect(applyRotate(pinned, createTangramState(pinned), 1).applied).toBe(false)
    let state = createTangramState(spec)
    expect(applyRotate(spec, state, 9).applied).toBe(false)
    for (let step = 0; step < 4; step += 1) {
      const result = applyRotate(spec, state, 0)
      expect(result.applied).toBe(true)
      state = result.state
      expect(state.ops).toBe(step + 1)
    }
    expect(state.orientations).toEqual([0, 0])
    expect(applyRotate(spec, applyPlace(spec, state, 0, 0).state, 0).applied).toBe(false)
  })

  it('returns fixed or empty blocks only, without spending ops', () => {
    const pinned: TangramSpec = { ...spec, fixed: [0] }
    const state = createTangramState(pinned)
    expect(applyRemove(pinned, state, 0).applied).toBe(false)
    expect(applyRemove(spec, state, 1).applied).toBe(false)
    const placed = applyPlace(spec, state, 1, 2).state
    const removed = applyRemove(spec, placed, 1)
    expect(removed.applied).toBe(true)
    expect(removed.state.placements).toEqual([0, null])
    expect(removed.state.ops).toBe(placed.ops)
  })
})

describe('tangram generator and scoring', () => {
  it('builds deterministic puzzles whose own anchors tile the board', () => {
    const options = { rows: 6, cols: 6, count: 4, families: ['I', 'L', 'O', 'T'] as const, sizeMin: 5, sizeMax: 12, allowRotate: true, seed: 77 }
    const first = buildTangramPuzzle(options)
    if (!first) throw new Error('expected a constructible puzzle')
    expect(buildTangramPuzzle(options)).toEqual(first)
    expect(judgeTangram(6, 6, [], [], []).solved).toBe(false)
    const puzzle = first
    const shapes = puzzle.pieces.map((piece) => piece.base)
    expect(shapes).toHaveLength(4)
    const blocks = puzzle.pieces.map((piece, id) => block(id, piece.base))
    expect(judgeTangram(6, 6, blocks, puzzle.solOrientations, puzzle.anchors).solved).toBe(true)
  })

  it('gives up on unsatisfiable libraries and falls back to guaranteed strips', () => {
    expect(buildTangramPuzzle({ rows: 3, cols: 3, count: 2, families: ['I'], sizeMin: 4, sizeMax: 5, allowRotate: true, seed: 5 })).toBeNull()
    const strips = buildStripPuzzle(5, 5, 3)
    expect(strips.pieces.map((piece) => piece.size)).toEqual([10, 9, 6])
    const blocks = strips.pieces.map((piece, id) => block(id, piece.base))
    expect(judgeTangram(5, 5, blocks, strips.solOrientations, strips.anchors).solved).toBe(true)
  })

  it('scores 1000 minus 15 per extra op and 50 per miss, floored at 100', () => {
    expect(scoreFor(2, 2)).toBe(1000)
    expect(scoreFor(1, 2)).toBe(1000)
    expect(scoreFor(4, 2)).toBe(970)
    expect(scoreFor(4, 2, 1)).toBe(920)
    expect(scoreFor(4, 2, MAX_MISSES)).toBe(820)
    expect(scoreFor(90, 2, MAX_MISSES)).toBe(100)
  })
})
