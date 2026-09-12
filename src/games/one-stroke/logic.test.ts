import { describe, expect, it } from 'vitest'
import { edgeBetween, hasEulerRoute, hierholzerRoute, initialStrokeState, isConnected, judgeMove, MAX_LIVES, oddVertices, oathKept, oathProgress, strokeScore } from './logic'
import { getStrokeLevel, STROKE_LEVEL_COUNT, strokeChapter, type StrokeLevel } from './levels'

const routeWalk = (level: StrokeLevel) => {
  const route = hierholzerRoute(level.size * level.size, level.edges, level.start)
  if (!route) return null
  let at = level.start
  let state = initialStrokeState(level)
  const results = route.map((edgeIndex) => {
    const [a, b] = level.edges[edgeIndex]
    const result = judgeMove(level, state, a === at ? b : a)
    state = result.state
    at = a === at ? b : a
    return result
  })
  return { route, results, state }
}

const safeFirstEdge = (spec: StrokeLevel) => spec.edges.findIndex(([a, b], index) => (a === spec.start || b === spec.start)
  && (index === spec.oathEdges[0] || !spec.oathEdges.includes(index)))

describe('one stroke graph construction', () => {
  it('builds sixty deterministic connected graphs with at most two odd vertices', () => {
    const signatures = new Set<string>()
    for (let level = 1; level <= STROKE_LEVEL_COUNT; level += 1) {
      const spec = getStrokeLevel(level)
      expect(getStrokeLevel(level)).toEqual(spec)
      const vertexCount = spec.size * spec.size
      expect(isConnected(vertexCount, spec.edges)).toBe(true)
      const odds = oddVertices(vertexCount, spec.edges)
      expect(odds.length <= 2).toBe(true)
      expect(odds.length % 2).toBe(0)
      if (odds.length === 2) expect(odds).toContain(spec.start)
      expect(spec.par).toBe(spec.edges.length)
      expect(spec.budget).toBeGreaterThanOrEqual(spec.par + 1)
      expect(new Set(spec.oathEdges).size).toBe(spec.oathEdges.length)
      expect(spec.oathEdges.every((index) => index >= 0 && index < spec.par)).toBe(true)
      signatures.add(`${spec.size}:${spec.edges.map(([a, b]) => `${a}.${b}`).join('|')}:${spec.start}`)
    }
    expect(signatures.size).toBe(STROKE_LEVEL_COUNT)
  })

  it('solves every level with a hierholzer route from the marked start', () => {
    for (let level = 1; level <= STROKE_LEVEL_COUNT; level += 1) {
      const spec = getStrokeLevel(level)
      expect(hasEulerRoute(spec.size * spec.size, spec.edges, spec.start)).toBe(true)
      const route = hierholzerRoute(spec.size * spec.size, spec.edges, spec.start)
      expect(route).not.toBeNull()
      expect(route).toHaveLength(spec.par)
      expect(new Set(route).size).toBe(spec.par)
      let at = spec.start
      for (const edgeIndex of route as number[]) {
        const [a, b] = spec.edges[edgeIndex]
        expect(a === at || b === at).toBe(true)
        at = a === at ? b : a
      }
      const walk = routeWalk(spec)
      expect(walk?.state.phase).toBe('complete')
      expect(walk?.state.walked).toHaveLength(spec.par)
      expect(walk?.state.mistakes).toBe(0)
      expect(walk?.state.score).toBe(strokeScore(spec, 0))
      expect(oathKept(walk?.state.walked ?? [], spec.oathEdges)).toBe(true)
    }
  })
})

describe('one stroke oath contract', () => {
  it('tracks oath progress as a strict prefix of the ordered contract edges', () => {
    expect(oathProgress([], [3, 4])).toBe(0)
    expect(oathProgress([3], [3, 4])).toBe(1)
    expect(oathProgress([3, 9, 1], [3, 4])).toBe(1)
    expect(oathProgress([3, 4], [3, 4])).toBe(2)
    expect(oathProgress([3, 4, 3], [3, 4])).toBe(2)
    expect(oathKept([3, 1, 4], [3, 4])).toBe(true)
    expect(oathKept([3, 1], [3, 4])).toBe(false)
    expect(oathKept([], [])).toBe(true)
  })

  it('plants every oath edge on the constructed euler route in sequence order', () => {
    for (let level = 34; level <= STROKE_LEVEL_COUNT; level += 1) {
      const spec = getStrokeLevel(level)
      if (!spec.oathEdges.length) continue
      const route = hierholzerRoute(spec.size * spec.size, spec.edges, spec.start) as number[]
      const positions = spec.oathEdges.map((edge) => route.indexOf(edge))
      expect(positions.every((position) => position >= 0), `level ${level}`).toBe(true)
      expect(new Set(positions).size).toBe(positions.length)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      const walk = routeWalk(spec)
      spec.oathEdges.forEach((edge, order) => expect(walk?.state.walked.indexOf(edge)).toBe(positions[order]))
    }
  })

  it('faults an out-of-order oath tap and only completes when the sequence is kept', () => {
    const spec = getStrokeLevel(36)
    expect(spec.oathEdges.length).toBeGreaterThan(1)
    const [first, second] = spec.oathEdges
    const [a, b] = spec.edges[second]
    const forged = { ...initialStrokeState(spec), at: a }
    const broken = judgeMove(spec, forged, b)
    expect(broken).toMatchObject({ valid: false, completed: false, failed: false, reason: 'oath' })
    expect(broken.state.walked).toEqual([])
    expect(broken.state.lives).toBe(2)
    expect(broken.state.mistakes).toBe(1)
    const exhausted = judgeMove(spec, { ...forged, lives: 1 }, b)
    expect(exhausted).toMatchObject({ valid: false, failed: true, reason: 'no-lives' })
    expect(exhausted.state.phase).toBe('failed')
    const keep = routeWalk(spec)
    expect(keep?.state.phase).toBe('complete')
    expect(oathProgress(keep?.state.walked ?? [], spec.oathEdges)).toBe(spec.oathEdges.length)
    expect(keep?.state.walked.indexOf(first)).toBeLessThan(keep?.state.walked.indexOf(second) ?? -1)
  })
})

describe('one stroke one-way edges', () => {
  it('arms three to five one-way edges on chapter two only, aligned with the constructive route', () => {
    for (let level = 1; level <= STROKE_LEVEL_COUNT; level += 1) {
      const spec = getStrokeLevel(level)
      if (spec.chapter !== 2) {
        expect(spec.oneWay).toEqual([])
        continue
      }
      expect(spec.oneWay.length).toBeGreaterThanOrEqual(3)
      expect(spec.oneWay.length).toBeLessThanOrEqual(5)
      expect(new Set(spec.oneWay.map((way) => way.edge)).size).toBe(spec.oneWay.length)
      const route = hierholzerRoute(spec.size * spec.size, spec.edges, spec.start) as number[]
      let at = spec.start
      const directions = new Map<number, { from: number; to: number }>()
      for (const edge of route) {
        const [a, b] = spec.edges[edge]
        const to = a === at ? b : a
        directions.set(edge, { from: at, to })
        at = to
      }
      // 构造解合规：每条单向边的箭头方向与构造欧拉路的走法一致
      for (const way of spec.oneWay) {
        expect(way.from).toBeGreaterThanOrEqual(0)
        expect(way.to).toBeLessThan(spec.size * spec.size)
        expect(directions.get(way.edge)).toEqual({ from: way.from, to: way.to })
      }
    }
  })

  it('faults taps against the arrow, passes taps along it, and keeps the constructive walk clean', () => {
    const spec = getStrokeLevel(14)
    const way = spec.oneWay[0]
    const backwards = judgeMove(spec, { ...initialStrokeState(spec), at: way.to }, way.from)
    expect(backwards).toMatchObject({ valid: false, completed: false, failed: false, reason: 'one-way' })
    expect(backwards.state.lives).toBe(MAX_LIVES - 1)
    expect(backwards.state.mistakes).toBe(1)
    expect(backwards.state.walked).toEqual([])
    const along = judgeMove(spec, { ...initialStrokeState(spec), at: way.from }, way.to)
    expect(along.valid).toBe(true)
    expect(along.reason).toBe('ok')
    expect(along.state.walked).toContain(way.edge)
    const routeWalked = routeWalk(spec)
    expect(routeWalked?.state.phase).toBe('complete')
    expect(routeWalked?.state.mistakes).toBe(0)
  })
})

describe('one stroke judgement state machine', () => {
  it('charges one life for repeat or detached taps and fails after three', () => {
    const spec = getStrokeLevel(4)
    const firstEdge = safeFirstEdge(spec)
    const first = spec.edges[firstEdge][0] === spec.start ? spec.edges[firstEdge][1] : spec.edges[firstEdge][0]
    let state = initialStrokeState(spec)
    state = judgeMove(spec, state, first).state
    expect(state.walked).toEqual([firstEdge])
    const back = judgeMove(spec, state, spec.start)
    expect(back.reason).toBe('repeat-edge')
    expect(back.state.lives).toBe(2)
    const detached = Array.from({ length: spec.size * spec.size }, (_, vertex) => vertex).find((vertex) => edgeBetween(spec.edges, first, vertex) < 0) as number
    const far = judgeMove(spec, back.state, detached)
    expect(far.reason).toBe('not-adjacent')
    expect(far.state.lives).toBe(1)
    const last = judgeMove(spec, far.state, detached)
    expect(last).toMatchObject({ failed: true, valid: false })
    expect(last.reason).toBe('no-lives')
    expect(last.state.phase).toBe('failed')
  })

  it('fails on budget overrun before lives run out in the late chapters', () => {
    const spec = getStrokeLevel(50)
    expect(spec.budget - spec.par).toBe(1)
    let state = initialStrokeState(spec)
    const firstEdge = safeFirstEdge(spec)
    const [a, b] = spec.edges[firstEdge]
    const exit = a === spec.start ? b : a
    state = judgeMove(spec, state, exit).state
    const back = judgeMove(spec, state, spec.start)
    expect(back).toMatchObject({ failed: false, reason: 'repeat-edge' })
    const detached = Array.from({ length: spec.size * spec.size }, (_, vertex) => vertex).find((vertex) => edgeBetween(spec.edges, exit, vertex) < 0 && vertex !== spec.start) as number
    const second = judgeMove(spec, back.state, detached)
    expect(second).toMatchObject({ failed: true })
    expect(second.reason).toBe('budget')
  })

  it('ignores idle taps on the current dot or after the round ends', () => {
    const spec = getStrokeLevel(2)
    const state = initialStrokeState(spec)
    expect(judgeMove(spec, state, spec.start).reason).toBe('idle')
    expect(judgeMove(spec, state, -3).reason).toBe('idle')
    expect(judgeMove(spec, state, spec.size * spec.size + 1).reason).toBe('idle')
    const finished: typeof state = { ...state, phase: 'complete' }
    expect(judgeMove(spec, finished, spec.edges[0][1]).state).toBe(finished)
  })
})

describe('one stroke difficulty curve', () => {
  it('grows grids, budgets tighten, and oaths appear on schedule', () => {
    const levels = Array.from({ length: STROKE_LEVEL_COUNT }, (_, index) => getStrokeLevel(index + 1))
    expect(levels.slice(0, 11).every((spec) => spec.chapter === 1)).toBe(true)
    expect(levels.slice(11, 22).every((spec) => spec.chapter === 2)).toBe(true)
    expect(levels.slice(22, 33).every((spec) => spec.chapter === 3)).toBe(true)
    expect(levels.slice(33, 44).every((spec) => spec.chapter === 4)).toBe(true)
    expect(levels.slice(44).every((spec) => spec.chapter === 5)).toBe(true)
    expect([1, 12, 23, 34, 45].map((level) => getStrokeLevel(level).size)).toEqual([3, 4, 5, 5, 6])
    const slacks = [1, 12, 23, 34, 45].map((level) => getStrokeLevel(level).budget - getStrokeLevel(level).par)
    expect(slacks).toEqual([12, 8, 3, 2, 1])
    for (let index = 1; index < levels.length; index += 1) expect(levels[index].budget - levels[index].par).toBeLessThanOrEqual(levels[index - 1].budget - levels[index - 1].par)
    const mean = (chapter: number) => {
      const batch = levels.filter((spec) => spec.chapter === chapter)
      return batch.reduce((total, spec) => total + spec.par, 0) / batch.length
    }
    for (let chapter = 2; chapter <= 5; chapter += 1) expect(mean(chapter)).toBeGreaterThan(mean(chapter - 1))
    expect(levels.filter((spec) => spec.chapter <= 3).every((spec) => spec.oathEdges.length === 0)).toBe(true)
    expect(getStrokeLevel(34).oathEdges.length).toBe(2)
    expect(getStrokeLevel(44).oathEdges.length).toBe(4)
    expect(getStrokeLevel(45).oathEdges.length).toBe(3)
    expect(getStrokeLevel(60).oathEdges.length).toBe(6)
    expect(getStrokeLevel(60).mode).toBe('gauntlet')
    expect(strokeChapter(60)).toBe(5)
  })
})
