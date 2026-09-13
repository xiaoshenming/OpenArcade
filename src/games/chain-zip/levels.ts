import { mulberry32, seedFor } from '../../platform/rng'
import { WORLD, drive, hang, quotaUnits, START_LIVES } from './logic'

export const LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const
export type ZipMode = 'calm' | 'ridge' | 'pulse' | 'lash' | 'storm'

export interface ZipLevel {
  level: number
  chapter: number
  mode: ZipMode
  meters: number
  rope: number
  swingStart: number
  spacing: number
  rise: number
  drop: number
  amp: number
  mover: boolean
  gold: boolean
  title: string
  detail: string
  seed: number
}

export interface AnchorSpec {
  index: number
  x: number
  baseY: number
  amp: number
  period: number
  phase: number
  gold: boolean
}

const chapterCopy: readonly (readonly [string, string])[] = [
  ['晨峡摆渡', '稀疏锚点低速摆渡，前倾三十度松手即可稳稳够到下一锚'],
  ['断脊云梯', '八百米断脊锚点高低错落，顺坡俯冲能荡出更远的抛物线'],
  ['浮枢回廊', '千米浮枢锚点上下缓动，读准相位再出手吸附'],
  ['长索疾风', '绳索分级加长甩速更快，收放时机的考验'],
  ['金枢风暴', '千米三终局，浮枢长索金锚齐现，吸住金锚每枚奖两百分'],
] as const

const metersByChapter = [600, 800, 1000, 1100, 1300] as const
const ropeByChapter = [15, 16, 17, 18, 19] as const
const spacingByChapter = [23, 25, 26, 29, 30] as const
const riseByChapter = [5, 6, 6, 5, 7] as const
const dropByChapter = [8, 18, 16, 15, 18] as const

export function getZipLevel(level: number): ZipLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  let chapter = 1
  for (let index = 0; index < CHAPTER_STARTS.length; index += 1) if (safe >= CHAPTER_STARTS[index]) chapter = index + 1
  const slot = safe - CHAPTER_STARTS[chapter - 1]
  const tail = chapter === 5 ? 15 : 10
  const progress = slot / tail
  return {
    level: safe,
    chapter,
    mode: (['calm', 'ridge', 'pulse', 'lash', 'storm'] as const)[chapter - 1],
    meters: metersByChapter[chapter - 1],
    rope: Math.round((ropeByChapter[chapter - 1] + (chapter === 4 ? slot * 0.8 : progress * 1.6)) * 10) / 10,
    swingStart: ((34 + ((safe - 1) / (LEVEL_COUNT - 1)) * 10) * Math.PI) / 180,
    spacing: Math.round((spacingByChapter[chapter - 1] + progress * 4) * 10) / 10,
    rise: riseByChapter[chapter - 1],
    drop: dropByChapter[chapter - 1],
    amp: chapter >= 3 ? Math.min(7, Math.round((2.5 + progress * 3.5 + (chapter - 3) * 0.9) * 10) / 10) : 0,
    mover: chapter >= 3,
    gold: chapter === 5,
    title: chapterCopy[chapter - 1][0],
    detail: chapterCopy[chapter - 1][1],
    seed: seedFor(safe, 31),
  }
}

const Y_MIN = 24
const FLOOR_SPACING = 4.5
const yCeiling = (spec: ZipLevel) => WORLD.ground - 2 - spec.rope - spec.amp

function validateLink(spec: ZipLevel, anchors: AnchorSpec[], entryTime: number, candidate: AnchorSpec): number | null {
  const stream = [...anchors, candidate]
  const origin = anchors[anchors.length - 1]
  const rounds = candidate.amp > 0 ? 8 : 1
  let first: number | null = null
  for (let k = 0; k < rounds; k += 1) {
    const start = hang(spec, origin, entryTime + (k * candidate.period) / rounds)
    const end = drive(start, spec, stream, 8, (current) => current.phase === 'swing' && current.anchor === candidate.index)
    const clean = end.lives === START_LIVES
    const reached = clean && (end.status === 'completed' || (end.phase === 'swing' && end.anchor === candidate.index))
    if (!reached) return null
    if (k === 0) first = end.time - 1 / 120
  }
  return first
}

const cache = new Map<number, AnchorSpec[]>()

export function createAnchors(level: number): AnchorSpec[] {
  const spec = getZipLevel(level)
  const cached = cache.get(spec.level)
  if (cached) return cached
  const rng = mulberry32(spec.seed)
  const limit = quotaUnits(spec) + spec.spacing * 3
  const anchors: AnchorSpec[] = [{ index: 0, x: WORLD.startX, baseY: 44, amp: spec.amp, period: spec.mover ? 3 : 1, phase: 0, gold: false }]
  const entries: number[] = [0]
  while (anchors[anchors.length - 1].x < limit || anchors.length < 5) {
    const prev = anchors[anchors.length - 1]
    const entry = entries[entries.length - 1]
    const spacingWant = spec.spacing * (0.92 + rng() * 0.24)
    const dy0 = rng() < 0.62 ? rng() * spec.drop : -rng() * spec.rise
    const period = spec.mover ? 2.6 + rng() * 1.2 : 1
    const phase0 = spec.mover ? rng() * Math.PI * 2 : 0
    let committed: AnchorSpec | null = null
    let nextEntry = entry
    for (let attempt = 0; attempt <= 40 && !committed; attempt += 1) {
      const fallback = attempt === 40
      const decay = Math.pow(0.88, attempt)
      const spacing = fallback ? FLOOR_SPACING : Math.max(FLOOR_SPACING + 0.5, spacingWant * decay)
      const dyFloor = spec.mover ? spec.amp : 0
      const dy = fallback ? 0 : dy0 * decay + dyFloor * (1 - decay)
      const baseY = Math.min(yCeiling(spec), Math.max(Y_MIN + spec.amp, prev.baseY + dy))
      const candidate: AnchorSpec = {
        index: prev.index + 1,
        x: prev.x + spacing,
        baseY,
        amp: spec.amp,
        period: fallback ? prev.period : period,
        phase: fallback ? prev.phase : phase0,
        gold: spec.gold && (prev.index + 1) % 4 === 2,
      }
      const found = validateLink(spec, anchors, entry, candidate)
      if (found !== null) {
        committed = candidate
        nextEntry = found
      }
    }
    if (!committed) {
      // fallback(水平密铺)仍连不上说明生成已退化:宁可显式报错也不能把 null 推进锚点流炸掉 pivotOf
      throw new Error(`chain-zip level ${spec.level}: anchor ${prev.index + 1} unreachable even with fallback placement`)
    }
    anchors.push(committed)
    entries.push(nextEntry)
  }
  cache.set(spec.level, anchors)
  return anchors
}
