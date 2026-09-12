import { mulberry32, seedFor } from '../../platform/rng'

export const RHYTHM_LEVEL_COUNT = 60
export const LANE_COUNT = 4
export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const
export const LEAD_IN_MS = 1600
export const TAIL_MS = 800
export const STEPS_PER_BEAT = 2
export const WARMUP_BEATS = 8
export const SLOW_SCALE = 0.55
// Chapter 2 ghost lures: hit one and it is judged as a miss, so the player has to
// recognise the translucent decoys and leave their lane alone. Placement is decided
// per bar instead of per note so lures never cluster inside one chart.
export const LURE_BAR_CHANCE = 0.4

export interface SpeedWindow {
  readonly start: number
  readonly end: number
  readonly scale: number
}

export interface LaneLevel {
  readonly level: number
  readonly chapter: number
  readonly bpm: number
  readonly bars: number
  readonly base: number
  readonly peak: number
  readonly doubles: boolean
  readonly doubleChance: number
  readonly speed: number
  readonly slowWindows: number
  readonly warmup: boolean
  readonly title: string
  readonly detail: string
}

export interface RhythmNote {
  readonly time: number
  readonly lane: number
  readonly decoy: boolean
}

export interface Chart {
  readonly notes: readonly RhythmNote[]
  readonly slowWindows: readonly SpeedWindow[]
  readonly beatMs: number
  readonly songMs: number
  readonly warmupUntilMs: number
}

interface ChapterSpec {
  readonly title: string
  readonly detail: string
  readonly bpm: number
  readonly bars: number
  readonly base: number
  readonly peak: number
  readonly doubles: boolean
  readonly doubleChance: number
  readonly slowWindows: number
  readonly warmup: boolean
  readonly speed: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  { title: '节拍起步', detail: '90 BPM 简谱：音符落到判定线时击打对应轨道，先读懂下落节奏', bpm: 90, bars: 12, base: 0.26, peak: 0.36, doubles: false, doubleChance: 0, slowWindows: 0, warmup: false, speed: 1 },
  { title: '幽灵·密度爬坡', detail: '105 BPM：半拍格音符变密，并混入半透明幽灵诱饵——识破后放过它，误击按 Miss 结算', bpm: 105, bars: 13, base: 0.4, peak: 0.58, doubles: false, doubleChance: 0, slowWindows: 0, warmup: false, speed: 1.05 },
  { title: '双押和弦', detail: '同一瞬间两轨齐落：双押要求双手同时命中，注意和弦排布', bpm: 105, bars: 14, base: 0.42, peak: 0.6, doubles: true, doubleChance: 0.2, slowWindows: 0, warmup: false, speed: 1.1 },
  { title: '变速区段', detail: '谱面标注减速窗口：下落突然放缓，重新校准内心的节拍器', bpm: 114, bars: 15, base: 0.5, peak: 0.7, doubles: false, doubleChance: 0, slowWindows: 2, warmup: false, speed: 1.15 },
  { title: '终局合流', detail: '双押+变速+长热身段：热身段 Miss 伤害减半，随后接受全面考验', bpm: 120, bars: 16, base: 0.52, peak: 0.72, doubles: true, doubleChance: 0.26, slowWindows: 3, warmup: true, speed: 1.2 },
]

const CHAPTER_STARTS = [1, 12, 23, 34, 45]

export function chapterOf(level: number) {
  const safe = Math.min(RHYTHM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getLaneLevel(level: number): LaneLevel {
  const safe = Math.min(RHYTHM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const start = CHAPTER_STARTS[chapter - 1]
  const span = (CHAPTER_STARTS[chapter] ?? RHYTHM_LEVEL_COUNT + 1) - start
  const ramp = span > 1 ? (safe - start) / (span - 1) : 0
  return {
    level: safe, chapter, bpm: spec.bpm, bars: spec.bars,
    base: spec.base + ramp * 0.05, peak: spec.peak + ramp * 0.05,
    doubles: spec.doubles, doubleChance: spec.doubleChance,
    speed: spec.speed + ramp * 0.06, slowWindows: spec.slowWindows, warmup: spec.warmup,
    title: safe === RHYTHM_LEVEL_COUNT ? '终局·全轨合流' : spec.title, detail: spec.detail,
  }
}

export function densityAt(progress: number, base: number, peak: number) {
  const clamped = Math.min(1, Math.max(0, progress))
  const arc = Math.sin(Math.PI * clamped) ** 0.8
  return base + (peak - base) * arc
}

export function slotWeight(slot: number) {
  if (slot % 8 === 0) return 1
  if (slot % 4 === 0) return 0.8
  return slot % 2 === 0 ? 0.55 : 0.3
}

function buildSlowWindows(spec: LaneLevel, random: () => number, beatMs: number): SpeedWindow[] {
  if (!spec.slowWindows) return []
  const windows: SpeedWindow[] = []
  const barMs = beatMs * 4
  const segment = (spec.bars - 5) / spec.slowWindows
  for (let index = 0; index < spec.slowWindows; index += 1) {
    const startBar = 3 + index * segment + Math.floor(random() * Math.max(1, segment - 3))
    const endBar = Math.min(spec.bars - 2, startBar + 2 + Math.floor(random() * 2))
    windows.push({ start: LEAD_IN_MS + startBar * barMs, end: LEAD_IN_MS + endBar * barMs, scale: SLOW_SCALE })
  }
  return windows
}

// Marks at most one note per bar as a translucent lure, leaving at least one real
// note per touched bar and consuming the rng stream only for chapter 2 charts.
function assignLures(notes: RhythmNote[], stepMs: number, random: () => number) {
  const barMs = stepMs * STEPS_PER_BEAT * 4
  const bars = new Map<number, number[]>()
  notes.forEach((note, index) => {
    const bar = Math.floor((note.time - LEAD_IN_MS) / barMs)
    const members = bars.get(bar) ?? []
    members.push(index)
    bars.set(bar, members)
  })
  for (const members of bars.values()) {
    if (members.length < 2 || random() >= LURE_BAR_CHANCE) continue
    const pick = members[Math.floor(random() * members.length)]
    notes[pick] = { ...notes[pick], decoy: true }
  }
}

export function generateChart(level: number): Chart {
  const safe = Math.min(RHYTHM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = getLaneLevel(safe)
  const beatMs = 60000 / spec.bpm
  const stepMs = beatMs / STEPS_PER_BEAT
  const slots = spec.bars * 4 * STEPS_PER_BEAT
  const random = mulberry32(seedFor(safe, 7))
  const notes: RhythmNote[] = []
  let lastLane = -1
  for (let slot = 0; slot < slots; slot += 1) {
    const progress = slots > 1 ? slot / (slots - 1) : 0
    if (slot > 0 && random() >= densityAt(progress, spec.base, spec.peak) * slotWeight(slot)) continue
    let lane = Math.floor(random() * LANE_COUNT)
    if (lane === lastLane && random() < 0.75) lane = (lane + 1 + Math.floor(random() * (LANE_COUNT - 1))) % LANE_COUNT
    notes.push({ time: LEAD_IN_MS + slot * stepMs, lane, decoy: false })
    lastLane = lane
    if (spec.doubles && slot % STEPS_PER_BEAT === 0 && random() < spec.doubleChance) {
      const chord = (lane + 1 + Math.floor(random() * (LANE_COUNT - 1))) % LANE_COUNT
      notes.push({ time: LEAD_IN_MS + slot * stepMs, lane: chord, decoy: false })
      lastLane = chord
    }
  }
  // Lure rolls run after placement so every other chapter's rng stream (including
  // the slow-window picks downstream) stays byte-identical.
  if (spec.chapter === 2) assignLures(notes, stepMs, random)
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane)
  return {
    notes, slowWindows: buildSlowWindows(spec, random, beatMs), beatMs,
    songMs: LEAD_IN_MS + spec.bars * 4 * beatMs + TAIL_MS,
    warmupUntilMs: spec.warmup ? LEAD_IN_MS + WARMUP_BEATS * beatMs : 0,
  }
}
