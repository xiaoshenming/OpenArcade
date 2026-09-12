import { mulberry32, seedFor } from '../../platform/rng'

export const LEVEL_COUNT = 60
export const CHAPTER_SIZE = 12
export const FIRST_GATE_X = 76
export const CLIMB_RATE = 14
const CENTER_MIN = 16
const CENTER_MAX = 76

export type HopMode = 'calm' | 'narrow' | 'drift' | 'gale' | 'storm'

export interface HopLevel {
  level: number
  chapter: number
  mode: HopMode
  gateCount: number
  gap: number
  speed: number
  spacing: number
  quota: number
  moving: boolean
  wind: boolean
  coin: boolean
  title: string
  detail: string
  seed: number
}

export interface GateSpec {
  index: number
  x: number
  base: number
  amp: number
  period: number
  phase: number
  coin: boolean
}

export interface WindSpec {
  period: number
  duration: number
  force: number
  phase: number
  direction: 1 | -1
}

const chapterCopy = [
  ['晨风试翼', '8 道宽门慢速飞行,熟悉拍翅与滑翔的节奏'],
  ['窄云回廊', '门数增至 12 道,门隙逐关收窄,精度的考验'],
  ['浮门迷阵', '门隙开始上下缓动,提前预判浮动的相位'],
  ['罡风走廊', '周期风阵横向推移小鸟,预警闪现后立刻生效'],
  ['风暴之心', '浮门、罡风与金币门叠加,穿过金环另得重赏'],
] as const
const gapRange = [[27, 25], [24, 22], [21.5, 20], [19.5, 18], [17.5, 16]] as const
const speedBase = [26, 29, 32, 33.2, 34.4] as const
const spacingBase = [26, 25, 26, 26, 27] as const
const deltaMax = [7, 8, 5, 3, 2] as const

export function getCloudLevel(level: number): HopLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = Math.floor((safe - 1) / CHAPTER_SIZE) + 1
  const slot = (safe - 1) % CHAPTER_SIZE
  const [gapStart, gapEnd] = gapRange[chapter - 1]
  const gap = Math.round((gapStart + (gapEnd - gapStart) * (slot / (CHAPTER_SIZE - 1))) * 2) / 2
  const mode = (['calm', 'narrow', 'drift', 'gale', 'storm'] as const)[chapter - 1]
  const [title, detail] = chapterCopy[chapter - 1]
  return {
    level: safe, chapter, mode, gateCount: chapter === 1 ? 8 : 12, gap,
    speed: Math.round((speedBase[chapter - 1] + slot * 0.1) * 10) / 10,
    spacing: spacingBase[chapter - 1], quota: chapter === 1 ? 8 : 12,
    moving: chapter >= 3, wind: chapter >= 4, coin: chapter === 5, title, detail,
    seed: seedFor(safe, 11),
  }
}

export function createGates(level: number): GateSpec[] {
  const spec = getCloudLevel(level)
  const random = mulberry32(spec.seed)
  const ampWant = spec.moving ? Math.min(3.5, 2 + (spec.level - 25) * 0.06) : 0
  const budget = (spec.spacing / spec.speed) * CLIMB_RATE
  const period = 3.8 + random() * 0.8
  const phase0 = random() * Math.PI * 2
  const dPhi = 0.3 + random() * 0.2
  const gates: GateSpec[] = []
  let base = 50
  let prevAmp = 0
  for (let index = 0; index < spec.gateCount; index += 1) {
    const next = index === 0 ? 50 : Math.min(CENTER_MAX, Math.max(CENTER_MIN, base + (random() * 2 - 1) * deltaMax[spec.chapter - 1]))
    const delta = Math.abs(next - base)
    const amp = Math.max(0, Math.min(ampWant, (budget - delta + spec.gap - 4) / 2, budget + spec.gap - 4 - delta - prevAmp))
    gates.push({
      index, x: FIRST_GATE_X + index * spec.spacing, base: next, amp,
      period, phase: phase0 + index * dPhi,
      coin: spec.coin && index % 3 === 1,
    })
    base = next
    prevAmp = amp
  }
  return gates
}

export function createWind(level: number): WindSpec | undefined {
  const spec = getCloudLevel(level)
  if (!spec.wind) return undefined
  const progress = (spec.level - (3 * CHAPTER_SIZE + 1)) / (LEVEL_COUNT - (3 * CHAPTER_SIZE + 1))
  const random = mulberry32(seedFor(spec.level, 23))
  return {
    period: 6.4 - progress * 1.6,
    duration: 1.6 + progress * 0.6,
    force: 6 + progress * 8,
    phase: random() * 6.4,
    direction: random() < 0.5 ? -1 : 1,
  }
}
