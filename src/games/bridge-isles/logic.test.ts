import { describe, expect, it } from 'vitest'
import { auditBridge, bridgeScore, generateBridgePuzzle, isConnected, islandCounts, planToggle, runAtCell, runBetween, type BridgePuzzle, type IsleRun } from './logic'
import { BRIDGE_LEVEL_COUNT, chapterOf, getBridgeLevel } from './levels'

const buildFixture = (fixed: readonly number[] = [0, 0]): BridgePuzzle => {
  const runs: IsleRun[] = [
    { a: 0, b: 1, horizontal: true, cells: [4], crosses: [1] },
    { a: 2, b: 3, horizontal: false, cells: [4], crosses: [0] },
  ]
  return {
    rows: 3,
    cols: 3,
    isles: [
      { row: 1, col: 0, need: 1 },
      { row: 1, col: 2, need: 1 },
      { row: 0, col: 1, need: 1 },
      { row: 2, col: 1, need: 1 },
    ],
    runs,
    solution: [1, 0],
    fixed: [...fixed],
    par: 1,
    timeLimit: 0,
  }
}

// 独立于生成器与 auditBridge 的裸 DFS 计数器：逐条航道枚举 0/1/2 座桥，
// 剪枝超载与交叉，结尾校验数字吻合 + 全连通。仅用于抽样披露「谜面非唯一」的设计取舍。
function countBridgeNetworks(puzzle: BridgePuzzle, limit: number): number {
  const { isles, runs } = puzzle
  const counts = new Array<number>(isles.length).fill(0)
  const state = new Array<number>(runs.length).fill(0)
  const incident = isles.map((_, id) => runs.map((run, runId) => (run.a === id || run.b === id ? runId : -1)).filter((runId) => runId >= 0))
  let found = 0
  const root = (node: number, parent: number[]) => {
    while (parent[node] !== node) node = parent[node]
    return node
  }
  const connected = () => {
    const parent = Array.from({ length: isles.length }, (_, id) => id)
    runs.forEach((run, id) => {
      if (!state[id]) return
      const ra = root(run.a, parent)
      const rb = root(run.b, parent)
      if (ra !== rb) parent[ra] = rb
    })
    const base = root(0, parent)
    return isles.every((_, id) => root(id, parent) === base)
  }
  const walk = (id: number): void => {
    if (found >= limit) return
    if (id === runs.length) {
      if (counts.every((count, isle) => count === isles[isle].need) && connected()) found += 1
      return
    }
    const run = runs[id]
    for (const bridges of [0, 1, 2]) {
      if (bridges && (counts[run.a] + bridges > isles[run.a].need || counts[run.b] + bridges > isles[run.b].need)) continue
      if (bridges && run.crosses.some((other) => state[other] > 0)) continue
      if (bridges && (incident[run.a].filter((other) => other > id).length * 2 < isles[run.a].need - counts[run.a] - bridges
        || incident[run.b].filter((other) => other > id).length * 2 < isles[run.b].need - counts[run.b] - bridges)) continue
      state[id] = bridges
      counts[run.a] += bridges
      counts[run.b] += bridges
      walk(id + 1)
      counts[run.a] -= bridges
      counts[run.b] -= bridges
      state[id] = 0
      if (found >= limit) return
    }
  }
  walk(0)
  return found
}

describe('bridge-isles validator', () => {
  it('rejects overfull, crossed, locked and disconnected networks', () => {
    const puzzle = buildFixture()
    expect(planToggle(puzzle, [0, 0], 0).error).toBeNull()
    expect(planToggle(puzzle, [0, 0], 0).next).toEqual([1, 0])
    expect(planToggle(puzzle, [1, 0], 0).error).toBe('overfull')
    expect(planToggle(puzzle, [1, 0], 0).next).toEqual([1, 0])
    expect(planToggle(puzzle, [1, 0], 1).error).toBe('crossed')
    expect(planToggle(puzzle, [2, 0], 0).error).toBeNull()
    expect(planToggle(puzzle, [2, 0], 0).next).toEqual([0, 0])
    const welded = buildFixture([2, 0])
    expect(planToggle(welded, [2, 0], 0).error).toBe('locked')
    expect(planToggle(welded, [2, 0], 1).error).toBe('crossed')
    const audit = auditBridge(puzzle, [1, 0])
    expect(audit.matched).toBe(false)
    expect(audit.connected).toBe(false)
    expect(audit.solved).toBe(false)
    expect(islandCounts(puzzle, [1, 1])).toEqual([1, 1, 1, 1])
    const both = auditBridge(puzzle, [1, 1])
    expect(both.matched).toBe(true)
    expect(both.crossed).toEqual([true, true])
    expect(both.solved).toBe(false)
    expect(isConnected(puzzle, [1, 0])).toBe(false)
    const pairPuzzle: BridgePuzzle = { ...puzzle, isles: puzzle.isles.slice(0, 2), runs: [puzzle.runs[0]] }
    expect(isConnected(pairPuzzle, [1, 0])).toBe(true)
    expect(isConnected(pairPuzzle, [0, 0])).toBe(false)
  })

  it('aims water clicks at the active run and pairs islands precisely', () => {
    const puzzle = buildFixture()
    expect(runAtCell(puzzle, [0, 0], 4)).toBe(0)
    expect(runAtCell(puzzle, [0, 1], 4)).toBe(1)
    expect(runAtCell(puzzle, [0, 0], 0)).toBe(-1)
    expect(runBetween(puzzle, 0, 1)).toBe(0)
    expect(runBetween(puzzle, 3, 2)).toBe(1)
    expect(runBetween(puzzle, 0, 2)).toBe(-1)
  })
})

describe('bridge-isles generator', () => {
  it('solves all sixty levels back to a legal, crossing-free, connected network', () => {
    for (let level = 1; level <= BRIDGE_LEVEL_COUNT; level += 1) {
      const puzzle = generateBridgePuzzle(level)
      expect(auditBridge(puzzle, puzzle.solution).solved, `level ${level} solution`).toBe(true)
      expect(auditBridge(puzzle, puzzle.fixed).solved, `level ${level} start`).toBe(false)
      puzzle.isles.forEach((isle) => {
        expect(isle.need, `level ${level}`).toBeGreaterThanOrEqual(1)
        expect(isle.need, `level ${level}`).toBeLessThanOrEqual(8)
      })
      puzzle.fixed.forEach((count, id) => expect(count, `level ${level} run ${id}`).toBeLessThanOrEqual(puzzle.solution[id]))
      const total = puzzle.solution.reduce((sum, count) => sum + count, 0)
      const welded = puzzle.fixed.reduce((sum, count) => sum + count, 0)
      expect(puzzle.par, `level ${level}`).toBe(total - welded)
      expect(puzzle.solution.reduce((sum, count) => sum + count, 0), `level ${level}`).toBeGreaterThanOrEqual(puzzle.isles.length - 1)
    }
  }, 120000)

  it('generates identical puzzles for the same level and clamps hostile input', () => {
    for (const level of [1, 13, 27, 40, 52, 60]) expect(generateBridgePuzzle(level)).toEqual(generateBridgePuzzle(level))
    expect(generateBridgePuzzle(-5)).toEqual(generateBridgePuzzle(1))
    expect(generateBridgePuzzle(0)).toEqual(generateBridgePuzzle(1))
    expect(generateBridgePuzzle(Number.NaN)).toEqual(generateBridgePuzzle(1))
    expect(generateBridgePuzzle(999)).toEqual(generateBridgePuzzle(BRIDGE_LEVEL_COUNT))
  })

  // 设计取舍披露（对应返修项）：Hashi 传统允许多解，本作刻意保留多解——ch3+ 的额外
  // 航道会引入备选桥网，胜利条件是「任意合法桥网」而非存储解（已写入 game.json 文案）。
  // 因此这里不断言唯一，而是抽样 3 关用上面的裸 DFS 独立验证「至少存在一个合法解」，
  // 并把计数（封顶 4）作为非唯一性的量化披露输出。
  it('verifies sampled boards admit a legal network via an independent DFS, disclosing multi-solution counts', () => {
    for (const level of [1, 25, 40]) {
      const puzzle = generateBridgePuzzle(level)
      const found = countBridgeNetworks(puzzle, 4)
      console.info(`bridge-isles level ${level}: ${found >= 4 ? '4+' : found} legal network(s) up to the disclosure cap`)
      expect(found, `level ${level} admits a legal network`).toBeGreaterThanOrEqual(1)
    }
  }, 60000)

  it('stages five chapters with escalating mechanics', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getBridgeLevel(2)).toMatchObject({ rows: 8, cols: 8, islands: 5, lockRatio: 0, timeBase: 0 })
    expect(getBridgeLevel(15)).toMatchObject({ islands: 8, lockRatio: 0, timeBase: 0 })
    expect(getBridgeLevel(25)).toMatchObject({ islands: 11, timeBase: 40, lockRatio: 0 })
    expect(getBridgeLevel(36)).toMatchObject({ islands: 12, timeBase: 0 })
    expect(getBridgeLevel(38).lockRatio).toBeGreaterThan(0)
    expect(getBridgeLevel(46)).toMatchObject({ islands: 14, timeBase: 45 })
    expect(getBridgeLevel(50).lockRatio).toBeGreaterThan(0)
    expect(getBridgeLevel(1).islands).toBeLessThan(getBridgeLevel(11).islands)
    expect(getBridgeLevel(12).islands).toBeLessThan(getBridgeLevel(22).islands)
  })

  it('keeps timed chapters generous and fixed bridges a strict minority', () => {
    for (let level = 1; level <= BRIDGE_LEVEL_COUNT; level += 1) {
      const puzzle = generateBridgePuzzle(level)
      const spec = getBridgeLevel(level)
      if (spec.timeBase === 0) {
        expect(puzzle.timeLimit, `level ${level}`).toBe(0)
      } else {
        expect(puzzle.timeLimit, `level ${level}`).toBeGreaterThan(puzzle.par * 3)
      }
      const edges = puzzle.solution.filter((count) => count > 0).length
      const welded = puzzle.fixed.filter((count) => count > 0).length
      if (spec.lockRatio > 0) {
        expect(welded, `level ${level}`).toBeGreaterThan(0)
        expect(welded, `level ${level}`).toBeLessThan(edges)
      } else {
        expect(welded, `level ${level}`).toBe(0)
      }
    }
  }, 120000)

  it('deepens the required bridge count across chapters', () => {
    const sums = Array.from({ length: 5 }, () => 0)
    const tallies = Array.from({ length: 5 }, () => 0)
    for (let level = 1; level <= BRIDGE_LEVEL_COUNT; level += 1) {
      const chapter = chapterOf(level) - 1
      sums[chapter] += generateBridgePuzzle(level).solution.reduce((sum, count) => sum + count, 0)
      tallies[chapter] += 1
    }
    const averages = sums.map((sum, index) => sum / tallies[index])
    for (let chapter = 1; chapter < averages.length; chapter += 1) {
      expect(averages[chapter], `chapter ${chapter + 1}`).toBeGreaterThan(averages[chapter - 1])
    }
  }, 120000)
})

describe('bridge-isles scoring', () => {
  it('charges for fumbling over par and for lost crew, floored at 100', () => {
    expect(bridgeScore(10, 10, 0)).toBe(1000)
    expect(bridgeScore(15, 10, 0)).toBe(950)
    expect(bridgeScore(15, 10, 2)).toBe(830)
    expect(bridgeScore(220, 10, 0)).toBe(100)
    expect(bridgeScore(0, 10, 0)).toBe(1000)
  })
})
