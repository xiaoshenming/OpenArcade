import { mulberry32, seedFor } from '../../platform/rng'
import { minGapMeters, pairGapMeters, simulateCourse, speedAt } from './logic'

export const PULSE_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45]
export const FIRST_GATE_M = 16
export const QUOTA_MARGIN = 10
export const SEED_SALT = 21
export const REPAIR_ROUNDS = 12

export interface PulseLevel {
  readonly level: number
  readonly chapter: number
  readonly ramp: number
  readonly quota: number
  readonly speed: number
  readonly gradient: number
  readonly colorCount: number
  readonly doubleChance: number
  readonly phantomChance: number
  readonly goldChance: number
  readonly title: string
  readonly detail: string
}

export interface Gate {
  readonly x: number
  readonly color: number
  readonly kind: 'solid' | 'phantom' | 'gold'
}

export interface Course {
  readonly level: PulseLevel
  readonly gates: readonly Gate[]
  readonly seed: number
}

const CHAPTERS = [
  { title: '双色起跑', detail: '600m 慢速热身：看准门框颜色，点击或空格把自身切成同色再穿门', quota: 600, speed: 11, gradient: 0, colorCount: 2, doubleChance: 0, phantomChance: 0, goldChance: 0 },
  { title: '三色加速', detail: '800m：第三色登场且门流更密，切色冷却内连按无效，出手要果断', quota: 800, speed: 12.5, gradient: 0, colorCount: 3, doubleChance: 0, phantomChance: 0, goldChance: 0 },
  { title: '双门连穿', detail: '900m：相邻双门必须连续两次同色穿过，第一门过后立刻准备下一色', quota: 900, speed: 14, gradient: 0, colorCount: 3, doubleChance: 0.34, phantomChance: 0, goldChance: 0 },
  { title: '虚影迷阵', detail: '1000m：全程持续提速，半透明虚影门穿过无效也无害，只负责扰乱判断', quota: 1000, speed: 15, gradient: 0.003, colorCount: 3, doubleChance: 0.3, phantomChance: 0.22, goldChance: 0 },
  { title: '金门终点', detail: '1200m：双门、虚影、提速全数合流，金色大门任意颜色可穿并额外 +200 分', quota: 1200, speed: 16, gradient: 0.0035, colorCount: 3, doubleChance: 0.36, phantomChance: 0.24, goldChance: 0.13 },
] as const

export function chapterOf(level: number) {
  const safe = Math.min(PULSE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getPulseLevel(level: number): PulseLevel {
  const safe = Math.min(PULSE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const start = CHAPTER_STARTS[chapter - 1]
  const span = (CHAPTER_STARTS[chapter] ?? PULSE_LEVEL_COUNT + 1) - start
  const ramp = span > 1 ? (safe - start) / (span - 1) : 0
  return {
    level: safe, chapter, ramp, ...spec,
    speed: spec.speed + ramp * 1.1,
    title: safe === PULSE_LEVEL_COUNT ? '终局·脉冲之心' : spec.title, detail: spec.detail,
  }
}

function pickColor(random: () => number, colors: number, prev: number) {
  if (random() < 0.42) return prev
  return Math.floor(random() * colors) % colors
}

function draftGates(spec: PulseLevel, random: () => number): Gate[] {
  const gates: Gate[] = []
  const slackMax = Math.max(0.15, 0.55 - (spec.chapter - 1) * 0.1)
  let x = FIRST_GATE_M
  let lastColor = 0
  let pairs = 0
  let phantoms = 0
  let golds = 0
  for (;;) {
    const color = pickColor(random, spec.colorCount, lastColor)
    const next = x + minGapMeters(spec, lastColor, color, x) + speedAt(spec, x) * (0.12 + random() * slackMax)
    if (next >= spec.quota - QUOTA_MARGIN) break
    x = next
    const canPair = spec.doubleChance > 0 && pairs < 12 + spec.chapter * 4 && x + speedAt(spec, x) * 1.4 < spec.quota - QUOTA_MARGIN
    const wantPair = canPair && random() < spec.doubleChance
    const wantGold = spec.goldChance > 0 && golds < 18 && !wantPair && random() < spec.goldChance
    if (wantGold) {
      gates.push({ x, color, kind: 'gold' })
      golds += 1
    } else {
      gates.push({ x, color, kind: 'solid' })
      if (wantPair) {
        const second = pickColor(random, spec.colorCount, color)
        const px = x + pairGapMeters(spec, color, second, x) + speedAt(spec, x) * random() * 0.06
        if (px < spec.quota - QUOTA_MARGIN) {
          gates.push({ x: px, color: second, kind: 'solid' })
          pairs += 1
          x = px
          lastColor = second
          continue
        }
      }
      lastColor = color
    }
    if (spec.phantomChance > 0 && phantoms < 26 && random() < spec.phantomChance) {
      const gx = x + Math.max(2.2, speedAt(spec, x) * 0.16)
      if (gx < spec.quota - QUOTA_MARGIN) {
        gates.push({ x: gx, color: Math.floor(random() * spec.colorCount) % spec.colorCount, kind: 'phantom' })
        phantoms += 1
        x = gx
      }
    }
  }
  return gates
}

function solidCount(gates: readonly Gate[]) {
  return gates.filter((gate) => gate.kind === 'solid').length
}

function ensureMechanics(spec: PulseLevel, gates: Gate[]): Gate[] {
  const next = [...gates]
  if (spec.doubleChance > 0 && solidCount(next) >= 2) {
    const hasPair = next.some((gate, index) => index > 0 && gate.kind === 'solid' && next[index - 1].kind === 'solid' && gate.x - next[index - 1].x < speedAt(spec, gate.x) * 0.7)
    if (!hasPair) {
      const first = next.findIndex((gate) => gate.kind === 'solid')
      const base = next[first]
      next.splice(first + 1, 0, { x: base.x + pairGapMeters(spec, base.color, base.color, base.x), color: base.color, kind: 'solid' })
    }
  }
  if (spec.phantomChance > 0 && !next.some((gate) => gate.kind === 'phantom')) {
    const anchor = next.find((gate) => gate.kind === 'solid')
    if (anchor) next.push({ x: anchor.x + Math.max(2.2, speedAt(spec, anchor.x) * 0.16), color: (anchor.color + 1) % spec.colorCount, kind: 'phantom' })
  }
  if (spec.goldChance > 0 && !next.some((gate) => gate.kind === 'gold')) {
    const solids = next.map((gate, index) => (gate.kind === 'solid' ? index : -1)).filter((index) => index >= 0)
    const at = solids[Math.floor(solids.length / 2)]
    next[at] = { ...next[at], kind: 'gold' }
  }
  return next
}

function normalizeGates(spec: PulseLevel, gates: readonly Gate[]): Gate[] {
  const sorted = [...gates].sort((a, b) => a.x - b.x)
  const clean: Gate[] = []
  for (const gate of sorted) {
    const prev = clean.at(-1)
    const x = Math.min(spec.quota - 1, Math.max(FIRST_GATE_M, prev ? Math.max(gate.x, prev.x + 1.4) : gate.x))
    if (prev && x - prev.x < 1.4) continue
    clean.push({ ...gate, x })
  }
  return clean
}

export function generateCourse(level: number): Course {
  const spec = getPulseLevel(level)
  const seed = seedFor(spec.level, SEED_SALT)
  const random = mulberry32(seed)
  let gates = normalizeGates(spec, ensureMechanics(spec, draftGates(spec, random)))
  for (let round = 0; round < REPAIR_ROUNDS; round += 1) {
    const report = simulateCourse(spec, { level: spec, gates, seed })
    if (report.survived && report.deaths === 0) break
    const target = report.fatal.find((index) => gates[index]?.kind === 'solid')
    if (target === undefined) break
    gates = gates.map((gate, index) => (index === target ? { ...gate, kind: 'gold' as const } : gate))
  }
  return { level: spec, gates, seed }
}
