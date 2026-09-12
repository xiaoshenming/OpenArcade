import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { buildScene, scrambleTurns, solveUnits, type LinkedPair, type Scene } from './logic'

export type WindowMode = 'garden' | 'deepen' | 'budget' | 'fogged' | 'gauntlet'

export interface WindowSpec {
  level: number
  chapter: number
  mode: WindowMode
  grid: number
  depth: number
  fogCount: number
  linkCount: number
  budgeted: boolean
  slack: number
  fog: boolean
  title: string
  detail: string
}

export interface WindowLevel {
  level: number
  chapter: number
  mode: WindowMode
  grid: number
  scene: Scene
  turns: number[]
  /** 镜像差：每瓦叠加 0 或 2 的 180° 对偶偏移，镜像瓦在转数 ≡ 2（mod 4）时归位 */
  deltas: number[]
  /** 迷雾瓦：图案被遮蔽，需靠邻瓦推断朝向（照常参与打乱与点击） */
  fogs: number[]
  /** 联动对：相邻瓦成对联动，点击一块两块同转 */
  links: readonly LinkedPair[]
  par: number
  budget?: number
  fog: boolean
  title: string
  detail: string
}

const CHAPTERS = [
  { begin: 1, size: 11, grid: 3, depth: [3, 2], fogs: [0, 0], links: [0, 0], budgeted: false, slack: 0, fog: false, mode: 'garden', title: '初启窗棂', detail: '点击瓦片顺时针旋转九十度，拼回完整窗景' },
  { begin: 12, size: 11, grid: 4, depth: [6, 4], fogs: [0, 0], links: [0, 0], budgeted: false, slack: 0, fog: false, mode: 'deepen', title: '四合格致', detail: '画幅扩到四乘四，打乱步数同步加深' },
  { begin: 23, size: 11, grid: 4, depth: [8, 5], fogs: [0, 0], links: [0, 0], budgeted: true, slack: 0.42, fog: false, mode: 'budget', title: '旋转预算', detail: '旋转次数超出预算即失败，先观察再动手' },
  { begin: 34, size: 11, grid: 5, depth: [12, 6], fogs: [2, 4], links: [2, 3], budgeted: false, slack: 0, fog: false, mode: 'fogged', title: '雾瓦联动', detail: '灰雾瓦遮住图案需推断，联动瓦一转俱转' },
  { begin: 45, size: 16, grid: 5, depth: [15, 9], fogs: [2, 3], links: [2, 4], budgeted: true, slack: 0.3, fog: true, mode: 'gauntlet', title: '雾中望景', detail: '联动瓦一转俱转，迷雾八秒遮住目标且预算收紧' },
] as const

export function getWindowSpec(level: number): WindowSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const config = CHAPTERS.find((chapter) => safe < chapter.begin + chapter.size) ?? CHAPTERS[CHAPTERS.length - 1]
  const progress = (safe - config.begin) / (config.size - 1)
  const [base, span] = config.depth
  const [fogMin, fogMax] = config.fogs
  const [linkMin, linkMax] = config.links
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    grid: config.grid,
    depth: base + Math.round(progress * span),
    fogCount: fogMin + Math.round(progress * (fogMax - fogMin)),
    linkCount: linkMin + Math.round(progress * (linkMax - linkMin)),
    budgeted: config.budgeted,
    slack: config.slack,
    fog: config.fog,
    title: safe === 60 ? '终局·雾锁窗景' : config.title,
    detail: config.detail,
  }
}

function pickFogs(count: number, fogCount: number, random: () => number): number[] {
  return shuffle(random, Array.from({ length: count }, (_, index) => index)).slice(0, fogCount).sort((a, b) => a - b)
}

function pickLinks(size: number, linkCount: number, blocked: readonly number[], random: () => number): LinkedPair[] {
  const blockedSet = new Set(blocked)
  const candidates: LinkedPair[] = []
  for (let index = 0; index < size * size; index += 1) {
    if (blockedSet.has(index)) continue
    if (index % size + 1 < size && !blockedSet.has(index + 1)) candidates.push({ a: index, b: index + 1 })
    if (index + size < size * size && !blockedSet.has(index + size)) candidates.push({ a: index, b: index + size })
  }
  const links: LinkedPair[] = []
  const used = new Set<number>()
  for (const pair of shuffle(random, candidates)) {
    if (links.length >= linkCount) break
    if (used.has(pair.a) || used.has(pair.b)) continue
    used.add(pair.a)
    used.add(pair.b)
    links.push(pair)
  }
  return links
}

export function createWindowLevel(level: number): WindowLevel {
  const spec = getWindowSpec(level)
  const random = mulberry32(seedFor(spec.level, 91))
  const scene = buildScene(random, spec.grid)
  const fogs = spec.fogCount > 0 ? pickFogs(spec.grid * spec.grid, spec.fogCount, random) : []
  const links = spec.linkCount > 0 ? pickLinks(spec.grid, spec.linkCount, fogs, random) : []
  const units = solveUnits(spec.grid * spec.grid, links)
  const { turns, deltas, applied } = scrambleTurns(spec.grid * spec.grid, units, spec.depth, random)
  return {
    level: spec.level,
    chapter: spec.chapter,
    mode: spec.mode,
    grid: spec.grid,
    scene,
    turns,
    deltas,
    fogs,
    links,
    par: applied,
    budget: spec.budgeted ? applied + Math.max(2, Math.ceil(applied * spec.slack)) : undefined,
    fog: spec.fog,
    title: spec.title,
    detail: spec.detail,
  }
}
