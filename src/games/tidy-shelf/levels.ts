import { mulberry32, seedFor } from '../../platform/rng'
import { buildTarget, inversionCount, isShelfTidy, type TidyLevel, type TidyMode } from './logic'

export interface TidySpec {
  readonly level: number
  readonly chapter: number
  readonly mode: TidyMode
  readonly cells: number
  readonly counts: readonly number[]
  readonly frozenCount: number
  readonly alternates: readonly [number, number] | null
  readonly slack: number
  readonly scrambles: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly size: number
  readonly cells: number
  readonly counts: readonly number[]
  readonly base: number
  readonly span: number
  readonly slack: number
  readonly frozen: readonly [number, number]
  readonly alternate: boolean
  readonly mode: TidyMode
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, size: 11, cells: 6, counts: [3, 3], base: 2, span: 3, slack: 1.4, frozen: [0, 0], alternate: false, mode: 'classic', title: '初理架格', detail: '相邻交换，让同类相邻、小件在前' },
  { begin: 12, size: 11, cells: 8, counts: [3, 3, 2], base: 4, span: 4, slack: 1.32, frozen: [0, 0], alternate: false, mode: 'grouped', title: '分门别类', detail: '三种类型各自成组，组内按尺寸排列' },
  { begin: 23, size: 11, cells: 10, counts: [4, 3, 3], base: 6, span: 5, slack: 1.28, frozen: [1, 2], alternate: false, mode: 'frozen', title: '冰封定位', detail: '结霜物品已经就位，且不能被移动' },
  { begin: 34, size: 11, cells: 12, counts: [3, 3, 3, 3], base: 7, span: 5, slack: 1.28, frozen: [0, 0], alternate: true, mode: 'alternating', title: '织彩交错', detail: '指定的两种颜色必须一隔一交错排列' },
  { begin: 45, size: 16, cells: 12, counts: [3, 3, 3, 3], base: 9, span: 5, slack: 1.15, frozen: [2, 3], alternate: true, mode: 'gauntlet', title: '终局·万格归整', detail: '交错、冰封与紧预算同时生效' },
]

export function getTidySpec(level: number): TidySpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.size)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.size - 1)
  const frozenCount = config.frozen[0] + (config.frozen[1] > config.frozen[0] && progress > 0.55 ? 1 : 0)
  const altSeed = (safe - config.begin) % 4
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    cells: config.cells,
    counts: config.counts,
    frozenCount,
    alternates: config.alternate ? [altSeed, (altSeed + 1) % 4] : null,
    slack: config.slack,
    scrambles: config.base + Math.round(progress * config.span),
    title: safe === 60 ? '终局·万格归整' : config.title,
    detail: config.detail,
  }
}

function pickFrozen(cells: number, count: number, random: () => number) {
  const candidates = [0, 1, 2, cells - 3, cells - 2, cells - 1].filter((value, index, list) => list.indexOf(value) === index)
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[candidates[index], candidates[swap]] = [candidates[swap], candidates[index]]
  }
  return candidates.slice(0, count).sort((a, b) => a - b)
}

export function scrambleShelf(target: readonly number[], shelf: number[], swaps: number, frozen: readonly number[], random: () => number) {
  const rank = new Map(target.map((item, index) => [item, index]))
  const frozenSet = new Set(frozen)
  const open = (left: number) => !frozenSet.has(left) && !frozenSet.has(left + 1) && (rank.get(shelf[left]) ?? 0) < (rank.get(shelf[left + 1]) ?? 0)
  let applied = 0
  let stall = 0
  while (applied < swaps && stall < 400) {
    const left = Math.floor(random() * (shelf.length - 1))
    if (open(left)) {
      ;[shelf[left], shelf[left + 1]] = [shelf[left + 1], shelf[left]]
      applied += 1
      stall = 0
    } else {
      stall += 1
      if (stall % 90 === 0) {
        const scan = shelf.findIndex((_, index) => index + 1 < shelf.length && open(index))
        if (scan < 0) break
        ;[shelf[scan], shelf[scan + 1]] = [shelf[scan + 1], shelf[scan]]
        applied += 1
      }
    }
  }
  return applied
}

export function createTidyLevel(level: number): TidyLevel {
  const spec = getTidySpec(level)
  const random = mulberry32(seedFor(spec.level, 77))
  const target = buildTarget(spec.counts, spec.alternates)
  const frozen = spec.frozenCount > 0 ? pickFrozen(spec.cells, spec.frozenCount, random) : []
  const shelf = [...target]
  scrambleShelf(target, shelf, spec.scrambles, frozen, random)
  let guard = 0
  while (isShelfTidy(shelf, spec.counts, spec.alternates) && guard < 40) {
    scrambleShelf(target, shelf, 1, frozen, random)
    guard += 1
  }
  const par = inversionCount(shelf, target)
  return { shelf, target, counts: spec.counts, par, budget: Math.max(par + 1, Math.ceil(par * spec.slack)), frozen, alternates: spec.alternates }
}
