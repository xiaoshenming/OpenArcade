import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bonsaiScore, createBonsaiState, cutBranch, isRemoved, isSolved, silhouette, UNDO_STEP_COST, undoCut } from './logic'
import { getBonsaiLevel } from './levels'

const PAR_RANGES: [number, number][] = [[1, 2], [2, 3], [2, 4], [3, 4], [3, 5]]

describe('bonsai generation', () => {
  it('generates sixty deterministic trees within shape bounds', () => {
    for (let level = 1; level <= 60; level += 1) {
      const first = getBonsaiLevel(level)
      const second = getBonsaiLevel(level)
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(first.leaves.length).toBeGreaterThanOrEqual(7)
      expect(first.leaves.length).toBeLessThanOrEqual(15)
      expect(first.nodes.length).toBeLessThanOrEqual(45)
      expect(first.nodes.some((node) => node.depth === first.depth)).toBe(true)
      expect(first.nodes[0]).toMatchObject({ parent: null, depth: 0 })
      expect(first.leaves.every((id) => first.nodes[id].leaf)).toBe(true)
      expect(first.leaves.map((id) => first.nodes[id].leafNo)).toEqual(Array.from({ length: first.leaves.length }, (_, i) => i + 1))
    }
  })

  it('ships constructed cuts that reach the target silhouette at par', () => {
    for (let level = 1; level <= 60; level += 1) {
      const spec = getBonsaiLevel(level)
      const [lo, hi] = PAR_RANGES[spec.chapter - 1]
      expect(spec.par).toBeGreaterThanOrEqual(lo)
      expect(spec.par).toBeLessThanOrEqual(hi)
      expect(spec.cuts).not.toContain(0)
      for (const a of spec.cuts) {
        for (const b of spec.cuts) {
          if (a !== b) expect(isRemoved(spec, a, [b])).toBe(false)
        }
      }
      expect(silhouette(spec, spec.cuts)).toEqual(spec.target)
      expect(isSolved(spec, spec.cuts)).toBe(true)
      expect(spec.target.length).toBeGreaterThanOrEqual(3)
      expect(spec.target.length).toBeLessThan(spec.leaves.length)
      expect(isSolved(spec, [])).toBe(false)
    }
  })

  it('accepts different cut sets that yield the same silhouette', () => {
    let checked = 0
    for (let level = 1; level <= 60; level += 1) {
      const spec = getBonsaiLevel(level)
      const inner = spec.cuts.find((id) => !spec.nodes[id].leaf && spec.leaves.filter((leaf) => isRemoved(spec, leaf, [id])).length >= 2)
      if (inner === undefined) continue
      const subtreeLeaves = spec.leaves.filter((id) => isRemoved(spec, id, [inner]))
      expect(subtreeLeaves.length).toBeGreaterThan(0)
      const alternative = [...spec.cuts.filter((id) => id !== inner), ...subtreeLeaves]
      expect(alternative).not.toEqual(spec.cuts)
      expect(alternative.length).toBeGreaterThan(spec.par)
      expect(silhouette(spec, alternative)).toEqual(spec.target)
      expect(isSolved(spec, alternative)).toBe(true)
      const spoiled = [...spec.cuts, spec.leaves[spec.target[0] - 1]]
      expect(isSolved(spec, spoiled)).toBe(false)
      checked += 1
    }
    expect(checked).toBeGreaterThan(40)
  })
})

describe('pruning state machine', () => {
  it('guards root cuts, double cuts and charges undo costs', () => {
    const spec = getBonsaiLevel(6)
    let state = createBonsaiState()
    expect(cutBranch(spec, state, 0)).toBe(state)
    state = cutBranch(spec, state, spec.cuts[0])
    expect(state.over).toBe('play')
    expect(state.cuts).toEqual([spec.cuts[0]])
    expect(state.totalCuts).toBe(1)
    expect(cutBranch(spec, state, spec.cuts[0])).toBe(state)
    const buried = spec.nodes.map((node) => node.id).find((id) => id !== spec.cuts[0] && isRemoved(spec, id, [spec.cuts[0]]))
    if (buried !== undefined) expect(cutBranch(spec, state, buried)).toBe(state)
    const undone = undoCut(spec, state)
    expect(undone.cuts).toEqual([])
    expect(undone.steps).toBe(1 + UNDO_STEP_COST)
    expect(undone.undos).toBe(1)
    expect(undoCut(spec, undone)).toBe(undone)
    expect(isSolved(spec, undone.cuts)).toBe(false)
  })

  it('fails budget chapters that overspend their steps', () => {
    for (const level of [23, 30, 40, 50, 60]) {
      const spec = getBonsaiLevel(level)
      expect(spec.budget).not.toBeNull()
      let state = cutBranch(spec, createBonsaiState(), spec.leaves[spec.target[0] - 1])
      expect(state.over).toBe('play')
      let guard = 0
      while (state.over === 'play' && guard < 200) {
        guard += 1
        const tip = spec.nodes.map((node) => node.id).find((id) => id !== 0 && !isRemoved(spec, id, state.cuts)
          && [spec.nodes[id].left, spec.nodes[id].right].every((kid) => kid === null || isRemoved(spec, kid, state.cuts)))
        state = tip !== undefined ? cutBranch(spec, state, tip) : undoCut(spec, state)
      }
      expect(state.over).toBe('lost')
      expect(state.steps).toBeGreaterThan(spec.budget!)
    }
  })

  it('restores a spoiled silhouette when the wrong cut is undone', () => {
    const spec = getBonsaiLevel(6)
    let state = cutBranch(spec, createBonsaiState(), spec.leaves[spec.target[0] - 1])
    expect(isSolved(spec, state.cuts)).toBe(false)
    for (const id of spec.cuts) state = cutBranch(spec, state, id)
    expect(state.over).toBe('play')
    expect(isSolved(spec, state.cuts)).toBe(false)
    state = undoCut(spec, state)
    expect(isSolved(spec, state.cuts)).toBe(false)
    while (state.cuts.length > 0) state = undoCut(spec, state)
    expect(state.cuts).toEqual([])
    expect(isSolved(spec, state.cuts)).toBe(false)
    for (const id of spec.cuts) state = cutBranch(spec, state, id)
    expect(state.over).toBe('won')
    expect(isSolved(spec, state.cuts)).toBe(true)
  })
})

describe('difficulty curve and scoring', () => {
  it('deepens trees, raises par and tightens budgets by chapter', () => {
    const levels = Array.from({ length: 60 }, (_, i) => getBonsaiLevel(i + 1))
    const avg = (list: typeof levels, read: (spec: (typeof levels)[number]) => number) =>
      list.reduce((sum, spec) => sum + read(spec), 0) / list.length
    for (let chapter = 2; chapter <= 5; chapter += 1) {
      const prev = levels.filter((spec) => spec.chapter === chapter - 1)
      const curr = levels.filter((spec) => spec.chapter === chapter)
      expect(Math.min(...curr.map((spec) => spec.depth))).toBeGreaterThanOrEqual(Math.min(...prev.map((spec) => spec.depth)))
      expect(Math.max(...curr.map((spec) => spec.depth))).toBeGreaterThanOrEqual(Math.max(...prev.map((spec) => spec.depth)))
      expect(Math.max(...curr.map((spec) => spec.par))).toBeGreaterThanOrEqual(Math.max(...prev.map((spec) => spec.par)))
      expect(avg(curr, (spec) => spec.par)).toBeGreaterThan(avg(prev, (spec) => spec.par) - 0.5)
    }
    expect(levels.slice(0, 22).every((spec) => spec.budget === null && spec.fog.length === 0)).toBe(true)
    expect(levels.slice(22).every((spec) => spec.budget !== null && spec.budget >= spec.par + 6)).toBe(true)
    expect(levels.slice(22, 33).every((spec) => spec.fog.length === 0)).toBe(true)
    expect(levels.slice(33).every((spec) => spec.fog.length > 0 && spec.fog.length <= spec.target.length - 2)).toBe(true)
    expect(levels.slice(33).every((spec) => spec.fog.every((leafNo) => spec.target.includes(leafNo)))).toBe(true)
    expect(levels.slice(44).every((spec) => spec.depth === 6)).toBe(true)
  })

  it('keeps a 44px transparent hit layer on nodes without changing their visual size', () => {
    const css = readFileSync(join(process.cwd(), 'src/games/bonsai-prune/bonsai-prune.css'), 'utf8')
    const hitLayer = css.match(/\.bnode::after\s*{([^}]*)}/)
    expect(hitLayer).not.toBeNull()
    expect(hitLayer![1]).toContain('width: 44px')
    expect(hitLayer![1]).toContain('height: 44px')
    expect(hitLayer![1]).toContain("content: ''")
    expect(css).toMatch(/\.bnode\.is-twig\s*{[^}]*width: 17px/)
    expect(css).toMatch(/\.bnode\.is-leaf\s*{[^}]*width: 30px/)
    expect(css).toMatch(/\.bonsai-button\s*{[^}]*height: 44px/)
  })

  it('scores precision and punishes waste without going under the floor', () => {
    const spec = getBonsaiLevel(1)
    const base = createBonsaiState()
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par })).toBe(1350)
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par, undos: 1 })).toBe(1295)
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par + 2 })).toBe(930)
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par, undos: 3 })).toBe(1285)
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par - 1 })).toBe(1050)
    expect(bonsaiScore(spec, { ...base, totalCuts: spec.par + 30 })).toBe(100)
    let state = createBonsaiState()
    for (const id of spec.cuts) state = cutBranch(spec, state, id)
    expect(state.over).toBe('won')
    expect(bonsaiScore(spec, state)).toBe(1350)
  })

  it('shuffles the target chips away from leaf order and veils fog and dead leaves alike', () => {
    for (let level = 1; level <= 60; level += 1) {
      const spec = getBonsaiLevel(level)
      expect(spec.chipOrder).toHaveLength(spec.leaves.length)
      expect([...spec.chipOrder].sort((a, b) => a - b)).toEqual(spec.leaves)
      expect(spec.chipOrder).not.toEqual(spec.leaves)
      expect(getBonsaiLevel(level).chipOrder).toEqual(spec.chipOrder)
      const natural = spec.chipOrder.map((id) => spec.nodes[id].leafNo)
      expect(natural).not.toEqual(Array.from({ length: natural.length }, (_, i) => i + 1))
    }
  })
})
