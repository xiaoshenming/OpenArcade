import type { DriftLevel } from './levels'

export type DriftMode = 'free' | 'budget' | 'fog' | 'wide' | 'gauntlet'

export interface DriftRule {
  readonly chapter: number
  readonly mode: DriftMode
  readonly title: string
  readonly detail: string
  readonly fog: boolean
  readonly previewMs: number
  readonly peekMs: number
  readonly peekPenalty: number
  readonly moveLimit?: number
}

const BUDGET_RATIOS: Record<number, number> = { 2: 1.15, 3: 1.08, 5: 1.15 }

const CHAPTER_COPY: Record<number, [DriftMode, string, string]> = {
  1: ['free', '初窥华容', '点击或用方向键把数字块滑入空格，复位整个棋盘'],
  2: ['budget', '步数预算', '可用步数封顶，超耗立即失败，先规划再动手'],
  3: ['fog', '迷雾残局', '目标排布十秒后隐入迷雾，重看一次扣 30 分'],
  4: ['wide', '五阶行阵', '棋盘扩张到五阶，考验全局规划与耐心'],
  5: ['gauntlet', '雾锁终局', '迷雾与预算同时生效，牢记目标谨慎行棋'],
}

export function getDriftRule(level: DriftLevel): DriftRule {
  const [mode, title, detail] = CHAPTER_COPY[level.chapter]
  const ratio = BUDGET_RATIOS[level.chapter]
  return {
    chapter: level.chapter,
    mode,
    title,
    detail,
    fog: level.fog,
    previewMs: level.fog ? 10000 : 0,
    peekMs: 4000,
    peekPenalty: 30,
    moveLimit: ratio === undefined ? undefined : Math.ceil(level.par * ratio),
  }
}
