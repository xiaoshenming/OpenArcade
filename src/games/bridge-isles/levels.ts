export interface BridgeLevel {
  readonly level: number
  readonly chapter: number
  readonly rows: number
  readonly cols: number
  readonly islands: number
  readonly extraChance: number
  readonly doubleChance: number
  readonly lockRatio: number
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
  readonly extraChance: number
  readonly doubleChance: number
  readonly lockRatio: number
  readonly timeBase: number
  readonly timeScale: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  {
    title: '晨屿初航', detail: '点击两岛之间的水面架桥：一击单桥，两击双桥，三击拆除。让每座岛的桥数与岛上数字一致，且全岛连通。',
    rows: 8, cols: 8, base: 5, span: 4, extraChance: 0.22, doubleChance: 0.4, lockRatio: 0, timeBase: 0, timeScale: 0,
  },
  {
    title: '千岛回廊', detail: '岛屿更密、水道更窄。桥不能交叉也不能穿过第三座岛，先想好主干航道再落子。',
    rows: 9, cols: 9, base: 8, span: 4, extraChance: 0.3, doubleChance: 0.45, lockRatio: 0, timeBase: 0, timeScale: 0,
  },
  {
    title: '潮汐刻漏', detail: '潮汐开始计时：超时未连通则航路断绝，架出超载或交叉的桥还会损失船员。',
    rows: 11, cols: 10, base: 11, span: 4, extraChance: 0.32, doubleChance: 0.5, lockRatio: 0, timeBase: 40, timeScale: 6,
  },
  {
    title: '遗桥故道', detail: '金色古桥已经架好且不可拆改，以它们为骨架补齐其余的桥，让旧航道重新贯通。',
    rows: 12, cols: 10, base: 12, span: 4, extraChance: 0.3, doubleChance: 0.5, lockRatio: 0.2, timeBase: 0, timeScale: 0,
  },
  {
    title: '群桥终章', detail: '大图、古桥与刻漏同时来袭：在时限内借固定桥的骨架补全整片群岛的航路。',
    rows: 13, cols: 11, base: 14, span: 5, extraChance: 0.34, doubleChance: 0.52, lockRatio: 0.15, timeBase: 45, timeScale: 5,
  },
]

export const BRIDGE_LEVEL_COUNT = 60

export function chapterOf(level: number): number {
  const safe = Math.min(BRIDGE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getBridgeLevel(level: number): BridgeLevel {
  const safe = Math.min(BRIDGE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const variant = safe - (1 + (chapter - 1) * 11)
  return {
    level: safe,
    chapter,
    rows: spec.rows,
    cols: spec.cols,
    islands: Math.min(spec.base + 2, spec.base + Math.floor(variant / spec.span)),
    extraChance: spec.extraChance,
    doubleChance: Math.min(0.62, spec.doubleChance + variant * 0.008),
    lockRatio: spec.lockRatio > 0 ? Math.min(spec.lockRatio + 0.1, spec.lockRatio + variant * 0.01) : 0,
    timeBase: spec.timeBase,
    timeScale: spec.timeScale,
    title: safe === BRIDGE_LEVEL_COUNT ? '终章·万桥归一' : spec.title,
    detail: spec.detail,
  }
}
