export type MineMode = 'garden' | 'clocked' | 'deep' | 'flagless' | 'hollow'

export interface MineLevelSpec {
  level: number
  chapter: number
  mode: MineMode
  rows: number
  columns: number
  mines: number
  par: number
  safeRadius: 1 | 2
  flagBonus: number
  timer: boolean
  title: string
  detail: string
}

export const MINE_LEVEL_COUNT = 60
export const CHAPTER_STARTS = [1, 12, 23, 34, 45] as const

export function chapterOf(level: number): number {
  if (level <= 11) return 1
  if (level <= 22) return 2
  if (level <= 33) return 3
  if (level <= 44) return 4
  return 5
}

interface ChapterPreset {
  mode: MineMode
  rows: number
  columns: number
  mines: (offset: number) => number
  par: (level: number) => number
  safeRadius: 1 | 2
  flagBonus: number
  timer: boolean
  title: string
  detail: string
}

const presets: readonly ChapterPreset[] = [
  {
    mode: 'garden', rows: 6, columns: 6, mines: (offset) => 3 + Math.floor(offset / 3), par: () => 60, safeRadius: 1, flagBonus: 0, timer: false,
    title: '初境·微光', detail: '6x6 小场，首击必开一片空白',
  },
  {
    mode: 'clocked', rows: 8, columns: 8, mines: (offset) => 10 + Math.floor(offset / 3), par: (level) => 140 - (level - 12) * 2, safeRadius: 1, flagBonus: 0, timer: true,
    title: '回廊·滴漏', detail: '计时 par 亮起，超时每 10 秒扣 10 分',
  },
  {
    mode: 'deep', rows: 10, columns: 10, mines: (offset) => 15 + Math.floor(offset / 3), par: (level) => 210 - (level - 23) * 3, safeRadius: 1, flagBonus: 0, timer: true,
    title: '深径·密雷', detail: '10x10 密雷场，雷数逐关上浮',
  },
  {
    mode: 'flagless', rows: 12, columns: 12, mines: (offset) => 24 + Math.floor(offset / 4), par: (level) => 290 - (level - 34) * 3, safeRadius: 1, flagBonus: 150, timer: true,
    title: '远征·无旗', detail: '不用旗帜完成可获 150 分奖励',
  },
  {
    mode: 'hollow', rows: 12, columns: 12, mines: (offset) => 28 + Math.floor(offset / 2), par: (level) => 420 - (level - 45) * 5, safeRadius: 2, flagBonus: 150, timer: true,
    title: '秘境·合流', detail: 'par 收紧，首击安全区扩至 5x5 且必开 3x3',
  },
]

export function getMineLevel(input: number): MineLevelSpec {
  const raw = Math.floor(Number(input))
  const level = Math.min(MINE_LEVEL_COUNT, Math.max(1, Number.isFinite(raw) ? raw : 1))
  const chapter = chapterOf(level)
  const preset = presets[chapter - 1]
  const offset = level - CHAPTER_STARTS[chapter - 1]
  return {
    level,
    chapter,
    mode: preset.mode,
    rows: preset.rows,
    columns: preset.columns,
    mines: preset.mines(offset),
    par: preset.par(level),
    safeRadius: preset.safeRadius,
    flagBonus: preset.flagBonus,
    timer: preset.timer,
    title: level === MINE_LEVEL_COUNT ? '终局·万雷归寂' : preset.title,
    detail: preset.detail,
  }
}
