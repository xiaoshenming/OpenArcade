export interface BeamLevel {
  readonly rows: number
  readonly cols: number
  readonly chapter: number
  readonly mirrors: number
  readonly splitters: number
  readonly decoys: number
  readonly blocks: number
  readonly budgeted: boolean
  readonly blackBox: boolean
  readonly minCovered: number
  readonly title: string
  readonly detail: string
}

interface ChapterSpec {
  readonly title: string
  readonly detail: string
  readonly rows: number
  readonly cols: number
  readonly mirrors: number
  readonly splitters: number
  readonly decoys: number
  readonly blocks: number
  readonly budgeted: boolean
  readonly blackBox: boolean
  readonly minCovered: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  { title: '折跃初训', detail: '点击空镜位放入平面镜，再点在 / 与 \\ 两种朝向间切换，点亮全部目标格', rows: 6, cols: 6, mirrors: 1, splitters: 0, decoys: 1, blocks: 0, budgeted: false, blackBox: false, minCovered: 7 },
  { title: '多标折跃', detail: '更宽的靶场需要两枚镜子接力折跃，光束拐两次弯才能扫亮所有目标', rows: 8, cols: 6, mirrors: 2, splitters: 0, decoys: 2, blocks: 0, budgeted: false, blackBox: false, minCovered: 9 },
  { title: '步数预算', detail: '挡板会吞噬光束；操作预算耗尽仍未点亮全部目标即宣告失败', rows: 8, cols: 8, mirrors: 2, splitters: 0, decoys: 2, blocks: 2, budgeted: true, blackBox: false, minCovered: 10 },
  { title: '分光双束', detail: '分光器把一束光折成两束，透射与反射两条光路同时点亮目标', rows: 8, cols: 8, mirrors: 2, splitters: 1, decoys: 2, blocks: 2, budgeted: true, blackBox: false, minCovered: 12 },
  { title: '黑盒终局', detail: '光路隐入黑盒，只能凭目标亮灭推理布局；分光与预算同时生效', rows: 8, cols: 8, mirrors: 3, splitters: 1, decoys: 1, blocks: 3, budgeted: true, blackBox: true, minCovered: 14 },
]

export const BEAM_LEVEL_COUNT = 60

export function chapterOf(level: number) {
  const safe = Math.min(BEAM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getBeamLevel(level: number): BeamLevel {
  const safe = Math.min(BEAM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const inChapter = safe - (1 + (chapter - 1) * 11)
  return {
    rows: spec.rows, cols: spec.cols, chapter, mirrors: spec.mirrors, splitters: spec.splitters,
    decoys: spec.decoys, blocks: spec.blocks, budgeted: spec.budgeted, blackBox: spec.blackBox,
    minCovered: spec.minCovered + Math.floor(inChapter / 3),
    title: safe === BEAM_LEVEL_COUNT ? '终局·黑盒折跃' : spec.title, detail: spec.detail,
  }
}
