import { describe, expect, it } from 'vitest'
import { applyPlace, applyRotate, createTangramState, judgeTangram, type TangramState } from './logic'
import { chapterOf, getTangramLevel, TANGRAM_LEVELS, type TangramLevel } from './levels'

const allLevels = () => Array.from({ length: TANGRAM_LEVELS }, (_, index) => getTangramLevel(index + 1))

const slackOf = (spec: TangramLevel) => (spec.moveLimit === undefined ? Number.POSITIVE_INFINITY : spec.moveLimit - spec.par)

function replay(spec: TangramLevel): { state: TangramState; ops: number } {
  let state = createTangramState(spec)
  spec.blocks.forEach((_, id) => {
    if (spec.fixed.includes(id)) return
    const turns = (spec.solOrientations[id] - state.orientations[id] + 4) % 4
    for (let step = 0; step < turns; step += 1) state = applyRotate(spec, state, id).state
    const placed = applyPlace(spec, state, id, spec.solution[id])
    expect(placed.applied, `level ${spec.level} block ${id} refused at ${spec.solution[id]}`).toBe(true)
    if (placed.applied) state = placed.state
  })
  return { state, ops: state.ops }
}

function expectFullBoard(spec: TangramLevel, orientations: readonly number[], placements: readonly (number | null)[]) {
  const area = spec.rows * spec.cols
  const verdict = judgeTangram(spec.rows, spec.cols, spec.blocks, orientations, placements)
  expect(verdict.solved, `level ${spec.level}`).toBe(true)
  expect(verdict.overlap, `level ${spec.level}`).toBe(false)
  expect(verdict.overflow, `level ${spec.level}`).toBe(false)
  expect(verdict.covered, `level ${spec.level}`).toBe(area)
}

describe('tangram-nest level book', () => {
  it('ships sixty deterministic levels whose constructed solutions replay to a full board', () => {
    for (let level = 1; level <= TANGRAM_LEVELS; level += 1) {
      const spec = getTangramLevel(level)
      const area = spec.rows * spec.cols
      expect(spec, `level ${level}`).toEqual(getTangramLevel(level))
      expect(spec.solution, `level ${level}`).toHaveLength(spec.blocks.length)
      expect(spec.solOrientations, `level ${level}`).toHaveLength(spec.blocks.length)
      expect(spec.blocks.reduce((sum, piece) => sum + piece.size, 0), `level ${level}`).toBe(area)
      spec.solution.forEach((anchor) => expect(anchor >= 0 && anchor < area, `level ${level} anchor ${anchor}`).toBe(true))
      expectFullBoard(spec, spec.solOrientations, spec.solution)
      const { state, ops } = replay(spec)
      expect(state.misses, `level ${level}`).toBe(0)
      expect(state.placements.every((spot) => spot !== null), `level ${level}`).toBe(true)
      expectFullBoard(spec, state.orientations, state.placements)
      if (spec.moveLimit !== undefined) expect(ops, `level ${level} ops`).toBeLessThanOrEqual(spec.moveLimit)
    }
  })

  it('advances five chapters with escalating, combined mechanics', () => {
    const specs = allLevels()
    expect(specs.slice(0, 11).every((spec) => spec.chapter === 1 && spec.rows === 5 && spec.cols === 5 && spec.rotateLocked && !spec.moveLimit && !spec.fixed.length && spec.blocks.length >= 3 && spec.blocks.length <= 4)).toBe(true)
    expect(specs.slice(11, 22).every((spec) => spec.chapter === 2 && spec.rows === 6 && spec.cols === 6 && !spec.rotateLocked && !spec.moveLimit && !spec.fixed.length)).toBe(true)
    expect(specs.slice(22, 33).every((spec) => spec.chapter === 3 && spec.rows === 6 && spec.cols === 7 && spec.moveLimit !== undefined && !spec.fixed.length)).toBe(true)
    expect(specs.slice(33, 44).every((spec) => spec.chapter === 4 && spec.fixed.length >= 1 && spec.fixed.length <= 2 && !spec.moveLimit && !spec.rotateLocked)).toBe(true)
    expect(specs.slice(44).every((spec) => spec.chapter === 5 && spec.rows === 6 && spec.cols === 8 && spec.moveLimit !== undefined && spec.fixed.length >= 1)).toBe(true)
    expect(specs.slice(0, 44).every((spec) => spec.blocks.every((piece) => piece.family !== 'S' && piece.family !== 'Z'))).toBe(true)
    expect(specs.slice(44).every((spec) => spec.blocks.some((piece) => piece.family === 'S' || piece.family === 'Z'))).toBe(true)
    expect(chapterOf(0)).toBe(1)
    expect(chapterOf(12)).toBe(2)
    expect(chapterOf(45)).toBe(5)
  })

  it('tightens the curve: blocks, par and fixed grow while slack shrinks inside chapters', () => {
    const specs = allLevels()
    for (const [start, end] of [[1, 11], [12, 22], [23, 33], [34, 44], [45, 60]] as const) {
      const chapter = specs.slice(start - 1, end)
      for (let index = 1; index < chapter.length; index += 1) {
        expect(chapter[index].blocks.length, `level ${start + index}`).toBeGreaterThanOrEqual(chapter[index - 1].blocks.length)
        expect(chapter[index].par, `level ${start + index}`).toBeGreaterThanOrEqual(chapter[index - 1].par)
        expect(chapter[index].fixed.length, `level ${start + index}`).toBeGreaterThanOrEqual(chapter[index - 1].fixed.length)
        expect(slackOf(chapter[index]), `level ${start + index}`).toBeLessThanOrEqual(slackOf(chapter[index - 1]))
      }
    }
    expect(specs[59].rows * specs[59].cols).toBeGreaterThan(specs[0].rows * specs[0].cols)
    expect(specs[59].blocks.length).toBeGreaterThan(specs[0].blocks.length)
    expect(specs[59].par).toBeGreaterThanOrEqual(specs[0].par)
  })

  it('pre-paves fixed blocks exactly on solution spots and starts the rest empty', () => {
    for (const spec of allLevels()) {
      if (!spec.fixed.length) continue
      expect(spec.fixed.length, `level ${spec.level}`).toBeLessThan(spec.blocks.length)
      const seeded = createTangramState(spec)
      const coverage = spec.blocks.reduce((sum, piece, id) => sum + (spec.fixed.includes(id) ? piece.size : 0), 0)
      const verdict = judgeTangram(spec.rows, spec.cols, spec.blocks, seeded.orientations, seeded.placements)
      expect(verdict.overlap, `level ${spec.level}`).toBe(false)
      expect(verdict.overflow, `level ${spec.level}`).toBe(false)
      expect(verdict.covered, `level ${spec.level}`).toBe(coverage)
      spec.fixed.forEach((id) => expect(seeded.placements[id], `level ${spec.level}`).toBe(spec.solution[id]))
      spec.blocks.forEach((_, id) => {
        if (!spec.fixed.includes(id)) expect(seeded.placements[id], `level ${spec.level}`).toBeNull()
      })
    }
    expect(getTangramLevel(34).fixed).toHaveLength(1)
    expect(getTangramLevel(43).fixed).toHaveLength(2)
  })

  it('keeps every budget above par with usable slack and clamps malformed levels', () => {
    expect(getTangramLevel(0).level).toBe(1)
    expect(getTangramLevel(-3).level).toBe(1)
    expect(getTangramLevel(999).level).toBe(60)
    expect(getTangramLevel(7.9).level).toBe(7)
    expect(getTangramLevel(Number.NaN).level).toBe(1)
    for (const spec of allLevels()) {
      expect(spec.par, `level ${spec.level}`).toBeGreaterThanOrEqual(1)
      if (spec.moveLimit !== undefined) {
        expect(spec.moveLimit, `level ${spec.level}`).toBeGreaterThan(spec.par)
        expect(spec.moveLimit - spec.par, `level ${spec.level}`).toBeGreaterThanOrEqual(3)
      }
    }
    expect(slackOf(getTangramLevel(23))).toBeGreaterThan(slackOf(getTangramLevel(33)))
    expect(slackOf(getTangramLevel(45))).toBeGreaterThan(slackOf(getTangramLevel(60)))
  })
})
