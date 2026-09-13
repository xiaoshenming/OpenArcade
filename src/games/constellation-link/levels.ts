import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { clueIndexes, neighborsOf, type Constellation, countSolutions } from './logic'

export const LEVEL_COUNT = 60

export type ConstellationMode = 'field' | 'corridor' | 'boundary' | 'budget' | 'nova'

export interface ConstellationSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: ConstellationMode
  readonly stars: number
  readonly cols: number
  readonly rows: number
  readonly chords: number
  readonly slack: number
  readonly mistakeLimit?: number
  readonly title: string
  readonly detail: string
}

export interface ConstellationPuzzle {
  readonly spec: ConstellationSpec
  readonly sky: Constellation
  readonly clues: number[]
  readonly solution: number[]
  readonly par: number
  readonly budget?: number
}

const chapterStart = [1, 12, 23, 34, 45]
const chapterEnd = [11, 22, 33, 44, 60]
const chapterCurve = [
  { stars: 6, span: 5, chords: [1, 2], slack: 0, mistakes: 0, mode: 'field', title: '初逢星野', detail: '点击相邻的星连成线，让每颗星的连线数等于度数标注' },
  { stars: 8, span: 5, chords: [2, 4], slack: 0, mistakes: 0, mode: 'corridor', title: '双星回廊', detail: '星数增多，先用度数高的星定位枢纽，再收束外围连线' },
  { stars: 10, span: 6, chords: [4, 5], slack: 0, mistakes: 3, mode: 'boundary', title: '失度边界', detail: '向已满度的星连线会计失误，累计 3 次星图崩塌' },
  { stars: 12, span: 6, chords: [5, 6], slack: 8, mistakes: 0, mode: 'budget', title: '连线预算', detail: '连线次数有预算，拆除重连同样消耗，落线前先推演' },
  { stars: 14, span: 7, chords: [6, 8], slack: 6, mistakes: 3, mode: 'nova', title: '极限星阵', detail: '失误上限与连线预算同时生效，终章星阵等待收束' },
] as const

export function chapterOf(level: number): number {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  return safe < 12 ? 1 : safe < 23 ? 2 : safe < 34 ? 3 : safe < 45 ? 4 : 5
}

export function getConstellationLevel(level: number): ConstellationSpec {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const curve = chapterCurve[chapter - 1]
  const progress = (safe - chapterStart[chapter - 1]) / (chapterEnd[chapter - 1] - chapterStart[chapter - 1])
  const chords = curve.chords[0] + Math.round((curve.chords[1] - curve.chords[0]) * progress)
  const slack = curve.slack ? Math.max(3, curve.slack - Math.round(progress * (curve.slack - 3))) : 0
  return {
    level: safe,
    chapter,
    mode: curve.mode,
    stars: curve.stars,
    cols: curve.span,
    rows: curve.span,
    chords,
    slack,
    mistakeLimit: curve.mistakes > 0 ? curve.mistakes : undefined,
    title: safe === LEVEL_COUNT ? '终局·万星归位' : curve.title,
    detail: curve.detail,
  }
}

function growCluster(random: () => number, cols: number, rows: number, stars: number): number[] | null {
  const span = Math.ceil(Math.sqrt(stars))
  const anchors: [number, number][] = []
  for (let y = 0; y + span <= rows; y += 1) for (let x = 0; x + span <= cols; x += 1) anchors.push([x, y])
  if (!anchors.length) return null
  const [ax, ay] = anchors[Math.floor(random() * anchors.length)]
  const order = shuffle(random, Array.from({ length: span * span }, (_, cell) => (ay + Math.floor(cell / span)) * cols + ax + (cell % span)))
  const picked = new Set<number>()
  for (let pass = 0; pass < 2 && picked.size < stars; pass += 1) {
    for (const cell of order) {
      if (picked.size >= stars) break
      if (picked.has(cell)) continue
      if (!picked.size || neighborsOf(cell, cols, rows).some((neighbor) => picked.has(neighbor))) picked.add(cell)
    }
  }
  return picked.size === stars ? [...picked] : null
}

function skyEdges(stars: number[], cols: number, rows: number) {
  const set = new Set(stars)
  const edges = [] as { a: number; b: number }[]
  for (const cell of stars) {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    if (col + 1 < cols && set.has(cell + 1)) edges.push({ a: cell, b: cell + 1 })
    if (row + 1 < rows && set.has(cell + cols)) edges.push({ a: cell, b: cell + cols })
  }
  return edges
}

function spanningTree(random: () => number, stars: number[], edges: { a: number; b: number }[]): number[] {
  const incidence = stars.map(() => [] as number[])
  edges.forEach((edge, index) => {
    incidence[stars.indexOf(edge.a)].push(index)
    incidence[stars.indexOf(edge.b)].push(index)
  })
  const seen = new Set([0])
  const tree: number[] = []
  const fringe = [...incidence[0]]
  while (fringe.length && seen.size < stars.length) {
    const pick = Math.floor(random() * fringe.length)
    const edge = fringe.splice(pick, 1)[0]
    const next = seen.has(stars.indexOf(edges[edge].a)) ? stars.indexOf(edges[edge].b) : stars.indexOf(edges[edge].a)
    if (seen.has(next)) continue
    seen.add(next)
    tree.push(edge)
    fringe.push(...incidence[next])
  }
  return tree
}

export function createConstellationPuzzle(level: number): ConstellationPuzzle {
  const spec = getConstellationLevel(level)
  for (let attempt = 0; attempt < 96; attempt += 1) {
    const random = mulberry32(seedFor(spec.level, attempt * 7 + 1))
    const stars = growCluster(random, spec.cols, spec.rows, spec.stars)
    if (!stars) continue
    const edges = skyEdges(stars, spec.cols, spec.rows)
    if (edges.length < spec.stars + 1) continue
    const tree = spanningTree(random, stars, edges)
    if (tree.length !== spec.stars - 1) continue
    const trunk = new Set(tree)
    const chords = shuffle(random, edges.map((_, edge) => edge).filter((edge) => !trunk.has(edge)))
    const sky: Constellation = { cols: spec.cols, rows: spec.rows, stars, edges }
    const ceiling = Math.min(spec.chords, chords.length, edges.length - tree.length - 1)
    for (let used = ceiling; used >= 1; used -= 1) {
      const solution = [...tree, ...chords.slice(0, used)]
      const clues = clueIndexes(sky, solution)
      if (countSolutions(sky, clues, 2) !== 1) continue
      return {
        spec,
        sky,
        clues,
        solution,
        par: solution.length,
        budget: spec.slack > 0 ? solution.length + spec.slack : undefined,
      }
    }
  }
  const random = mulberry32(seedFor(spec.level, 999))
  const stars = growCluster(random, spec.cols, spec.rows, spec.stars) as number[]
  const edges = skyEdges(stars, spec.cols, spec.rows)
  const tree = spanningTree(random, stars, edges)
  const sky: Constellation = { cols: spec.cols, rows: spec.rows, stars, edges }
  const clues = clueIndexes(sky, tree)
  return { spec, sky, clues, solution: tree, par: tree.length, budget: spec.slack > 0 ? tree.length + spec.slack : undefined }
}
