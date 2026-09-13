import { mulberry32, seedFor } from '../../platform/rng'
import { isSeaLinked, orthNeighbors, solveReport, type Clue, type SeaPuzzle } from './logic'

export interface SeaLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly cols: number
  readonly islands: number
  readonly minSize: number
  readonly maxSize: number
  readonly givenRatio: number
  readonly timeBase: number
  readonly timeScale: number
  readonly title: string
  readonly detail: string
}

interface ChapterSpec {
  readonly title: string
  readonly detail: string
  readonly rows: number
  readonly cols: number
  readonly base: number
  readonly span: number
  readonly minSize: number
  readonly maxSize: number
  readonly givenRatio: number
  readonly timeBase: number
  readonly timeScale: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  {
    title: '浅滩初潮', detail: '点击格子涂成海：每座岛（含数字的白格连通块）格数须恰等于数字，两岛不可相邻，海必须连成一片且不许出现 2x2 方块。',
    rows: 6, cols: 6, base: 4, span: 5, minSize: 1, maxSize: 3, givenRatio: 0, timeBase: 0, timeScale: 0,
  },
  {
    title: '暗流回廊', detail: '墓苑变大，岛更多。用数字把岛围死，再让剩余海面彼此贯通——任何一片死海都是败笔。',
    rows: 8, cols: 6, base: 6, span: 5, minSize: 1, maxSize: 3, givenRatio: 0, timeBase: 0, timeScale: 0,
  },
  {
    title: '汐钟墓潮', detail: '汐钟开始倒数：超时未能定局即失败。按下「验证海图」若已误入死局，会惊动亡灵。',
    rows: 9, cols: 7, base: 9, span: 5, minSize: 1, maxSize: 3, givenRatio: 0, timeBase: 40, timeScale: 3,
  },
  {
    title: '先潮引路', detail: '部分海面已被先行者涂好且不可更改，以它们为锚点推出整片墓海。',
    rows: 9, cols: 8, base: 10, span: 5, minSize: 1, maxSize: 3, givenRatio: 0.1, timeBase: 0, timeScale: 0,
  },
  {
    title: '海墓终局', detail: '大图、预涂海面与汐钟同时压境：在时限内补全整座海墓林苑。',
    rows: 10, cols: 8, base: 11, span: 5, minSize: 2, maxSize: 4, givenRatio: 0.08, timeBase: 45, timeScale: 3,
  },
]

export const NURIKABE_LEVEL_COUNT = 60

export function chapterOf(level: number): number {
  const safe = Math.min(NURIKABE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getSeaLevel(level: number): SeaLevel {
  const safe = Math.min(NURIKABE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const variant = safe - (1 + (chapter - 1) * 11)
  return {
    level: safe,
    chapter,
    rows: spec.rows,
    cols: spec.cols,
    islands: spec.base + Math.floor(variant / spec.span),
    minSize: spec.minSize,
    maxSize: spec.maxSize,
    givenRatio: spec.givenRatio > 0 ? Math.min(spec.givenRatio + 0.08, spec.givenRatio + variant * 0.005) : 0,
    timeBase: spec.timeBase,
    timeScale: spec.timeScale,
    title: safe === NURIKABE_LEVEL_COUNT ? '终章·万墓归海' : spec.title,
    detail: spec.detail,
  }
}

function seaBlocks(owner: readonly number[], rows: number, cols: number): number[][] {
  const blocks: number[][] = []
  for (let cell = 0; cell < owner.length; cell += 1) {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    if (row + 1 >= rows || col + 1 >= cols) continue
    const block = [cell, cell + 1, cell + cols, cell + cols + 1]
    if (block.every((spot) => owner[spot] < 0)) blocks.push(block)
  }
  return blocks
}

function attemptPuzzle(rng: () => number, spec: SeaLevel): SeaPuzzle | null {
  const { rows, cols, minSize, maxSize } = spec
  const total = rows * cols
  const owner = new Array<number>(total).fill(-1)
  const seeds: number[] = []
  const sizes: number[] = []
  const freeToJoin = (cell: number, id: number) =>
    owner[cell] === -1 && orthNeighbors(cell, rows, cols).every((next) => owner[next] === -1 || owner[next] === id)
  for (let id = 0; id < spec.islands; id += 1) {
    const target = minSize + Math.floor(rng() * (maxSize - minSize + 1))
    const options: number[] = []
    for (let cell = 0; cell < total; cell += 1) if (freeToJoin(cell, -2)) options.push(cell)
    if (options.length === 0) return null
    const seed = options[Math.floor(rng() * options.length)]
    owner[seed] = id
    let size = 1
    const frontier = [...orthNeighbors(seed, rows, cols)]
    while (size < target && frontier.length > 0) {
      const pick = Math.floor(rng() * frontier.length)
      const cell = frontier[pick]
      frontier[pick] = frontier[frontier.length - 1]
      frontier.pop()
      if (!freeToJoin(cell, id)) continue
      owner[cell] = id
      size += 1
      frontier.push(...orthNeighbors(cell, rows, cols))
    }
    seeds.push(seed)
    sizes.push(size)
  }
  const cap = maxSize + 2
  const seaArray = () => owner.map((o) => o < 0)
  const islandStillLinked = (id: number, drop: number) => {
    const cells = owner.map((o, cell) => (o === id && cell !== drop ? cell : -1)).filter((cell) => cell >= 0)
    if (cells.length === 0) return true
    const seen = new Set<number>([cells[0]])
    const queue = [cells[0]]
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of orthNeighbors(queue[head], rows, cols)) {
        if (owner[next] === id && next !== drop && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    return seen.size === cells.length
  }
  const shrinkOne = (protectedCells: Set<number>): boolean => {
    const seaOf = seaArray()
    const compOf = new Array<number>(total).fill(-1)
    let compCount = 0
    for (let start = 0; start < total; start += 1) {
      if (!seaOf[start] || compOf[start] >= 0) continue
      const id = compCount
      compCount += 1
      const group = [start]
      compOf[start] = id
      for (let head = 0; head < group.length; head += 1) {
        for (const next of orthNeighbors(group[head], rows, cols)) {
          if (seaOf[next] && compOf[next] < 0) {
            compOf[next] = id
            group.push(next)
          }
        }
      }
    }
    if (compCount <= 1) return false
    const candidates: number[] = []
    for (let cell = 0; cell < total; cell += 1) {
      const id = owner[cell]
      if (id < 0 || cell === seeds[id] || sizes[id] <= 1 || protectedCells.has(cell)) continue
      const borders = new Set<number>()
      for (const next of orthNeighbors(cell, rows, cols)) if (seaOf[next]) borders.add(compOf[next])
      if (borders.size < 2 || !islandStillLinked(id, cell)) continue
      candidates.push(cell)
    }
    if (candidates.length === 0) return false
    const cell = candidates[Math.floor(rng() * candidates.length)]
    const id = owner[cell]
    owner[cell] = -1
    sizes[id] -= 1
    return true
  }
  const repaired = new Set<number>()
  for (let round = 0; round < 240; round += 1) {
    if (!isSeaLinked(seaArray(), rows, cols)) {
      if (!shrinkOne(repaired)) return null
      continue
    }
    const blocks = seaBlocks(owner, rows, cols)
    if (blocks.length === 0) break
    const near = new Set<number>()
    for (const block of blocks) {
      block.forEach((cell) => near.add(cell))
      block.forEach((cell) => orthNeighbors(cell, rows, cols).forEach((next) => {
        if (owner[next] === -1) near.add(next)
      }))
    }
    const direct: { cell: number; island: number }[] = []
    const approach: { cell: number; island: number }[] = []
    for (const cell of near) {
      for (const next of orthNeighbors(cell, rows, cols)) {
        const island = owner[next]
        if (island < 0 || sizes[island] >= cap || !freeToJoin(cell, island)) continue
        ;(blocks.some((block) => block.includes(cell)) ? direct : approach).push({ cell, island })
      }
    }
    const pool = direct.length > 0 ? direct : approach
    if (pool.length === 0) {
      if (!shrinkOne(repaired)) return null
      continue
    }
    const choice = pool[Math.floor(rng() * pool.length)]
    owner[choice.cell] = choice.island
    sizes[choice.island] += 1
    repaired.add(choice.cell)
  }
  if (seaBlocks(owner, rows, cols).length > 0 || !isSeaLinked(seaArray(), rows, cols)) return null
  const solution = seaArray()
  const sea = solution.reduce((sum, flag) => sum + (flag ? 1 : 0), 0)
  const clues: Clue[] = seeds.map((cell, id) => ({ cell, need: sizes[id] }))
  const given = solution.map(() => false)
  const blank = new Array<number>(total).fill(0)
  const probe: SeaPuzzle = { rows, cols, clues, given, solution, par: sea, timeLimit: 0 }
  const settledUnique = () => {
    const report = solveReport(probe, blank, 2, 1200)
    return report.settled && report.count === 1
  }
  if (spec.givenRatio > 0) {
    const quota = Math.round(sea * (spec.givenRatio + 0.06))
    let report = solveReport(probe, blank, 2, 1200)
    let guard = quota + 4
    while (!(report.settled && report.count === 1) && guard > 0) {
      guard -= 1
      if (report.count < 2) break
      const [first, second] = report.samples
      const divisive = solution.map((flag, cell) => (flag && first[cell] !== second[cell] ? cell : -1)).filter((cell) => cell >= 0)
      if (divisive.length === 0) break
      given[divisive[Math.floor(rng() * divisive.length)]] = true
      report = solveReport(probe, blank, 2, 1200)
    }
    if (!(report.settled && report.count === 1)) return null
  } else if (!settledUnique()) {
    return null
  }
  const welded = given.reduce((sum, flag) => sum + (flag ? 1 : 0), 0)
  return { rows, cols, clues, given, solution, par: sea - welded, timeLimit: spec.timeBase > 0 ? spec.timeBase + sea * spec.timeScale : 0 }
}

export function generateSeaPuzzle(level: number): SeaPuzzle {
  const safe = Math.min(NURIKABE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = getSeaLevel(safe)
  const rng = mulberry32(seedFor(safe, 47))
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const puzzle = attemptPuzzle(rng, spec)
    if (puzzle) return puzzle
  }
  throw new Error(`nurikabe-sea level ${safe} generation exhausted`)
}
