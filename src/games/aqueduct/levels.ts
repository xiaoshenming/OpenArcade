export interface AquaLevel {
  readonly rows: number
  readonly cols: number
  readonly chapter: number
  readonly dual: boolean
  readonly fog: boolean
  readonly budgeted: boolean
  readonly locks: boolean
  readonly chaos: number
  readonly lockRatio: number
  readonly slackRate: number
  readonly title: string
  readonly detail: string
}

interface ChapterSpec {
  readonly title: string
  readonly detail: string
  readonly rows: number
  readonly cols: number
  readonly dual: boolean
  readonly fog: boolean
  readonly budgeted: boolean
  readonly locks: boolean
  readonly chaos: number
  readonly lockRatio: number
  readonly slackRate: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  { title: '导流初训', detail: '点击管道旋转 90°，把源头活水引到每一个汇点', rows: 5, cols: 5, dual: false, fog: false, budgeted: false, locks: false, chaos: 0.55, lockRatio: 0, slackRate: 0 },
  { title: '步数配给', detail: '水压有限：预算耗尽仍未贯通即宣告失败', rows: 6, cols: 6, dual: false, fog: false, budgeted: true, locks: false, chaos: 1, lockRatio: 0, slackRate: 0.4 },
  { title: '锈蚀锁件', detail: '焊死的管道不可旋转，围绕它们规划整条水路', rows: 7, cols: 7, dual: false, fog: false, budgeted: false, locks: true, chaos: 1, lockRatio: 0.14, slackRate: 0 },
  { title: '双源并流', detail: '两处源头各自成树，同时灌满整张格网', rows: 8, cols: 8, dual: true, fog: false, budgeted: false, locks: false, chaos: 0.88, lockRatio: 0, slackRate: 0 },
  { title: '迷雾终局', detail: '迷雾笼罩未通水的暗格，限步之下贯通双源水网', rows: 8, cols: 8, dual: true, fog: true, budgeted: true, locks: false, chaos: 1, lockRatio: 0, slackRate: 0.3 },
]

export const AQUA_LEVEL_COUNT = 60

export function chapterOf(level: number) {
  const safe = Math.min(AQUA_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getAquaLevel(level: number): AquaLevel {
  const safe = Math.min(AQUA_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const chaos = chapter === 1 ? Math.min(1, spec.chaos + (safe - 1) * 0.045) : spec.chaos
  const lockRatio = spec.locks ? Math.min(0.28, spec.lockRatio + (safe - 23) * 0.012) : 0
  return {
    rows: spec.rows, cols: spec.cols, chapter, dual: spec.dual, fog: spec.fog, budgeted: spec.budgeted,
    locks: spec.locks, chaos, lockRatio, slackRate: spec.slackRate,
    title: safe === AQUA_LEVEL_COUNT ? '终局·雾中双源' : spec.title, detail: spec.detail,
  }
}
