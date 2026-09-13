export interface CloudLevel {
  readonly rows: number
  readonly cols: number
  readonly chapter: number
  readonly walk: number
  readonly anchors: number
  readonly storms: number
  readonly fog: boolean
  readonly slack: number
  readonly title: string
  readonly detail: string
}

interface ChapterSpec {
  readonly title: string
  readonly detail: string
  readonly rows: number
  readonly cols: number
  readonly walk: number
  readonly anchors: number
  readonly storms: number
  readonly fog: boolean
  readonly slack: number
}

const CHAPTERS: readonly ChapterSpec[] = [
  { title: '云径初绘', detail: '从起点上下左右逐格延伸云径，经过所有锚点且线不自交', rows: 6, cols: 6, walk: 12, anchors: 3, storms: 0, fog: false, slack: 8 },
  { title: '步数预算', detail: '云径不能超过预算步数，绕路太多就要收笔重来', rows: 7, cols: 7, walk: 18, anchors: 4, storms: 0, fog: false, slack: 6 },
  { title: '迷雾锚点', detail: '锚点五秒后隐入迷雾，凭记忆把它们串进同一条云径', rows: 8, cols: 8, walk: 26, anchors: 5, storms: 0, fog: true, slack: 6 },
  { title: '风暴格', detail: '风暴格不可踏入，规划云径时绕开它们并当心自交', rows: 8, cols: 8, walk: 28, anchors: 5, storms: 3, fog: false, slack: 5 },
  { title: '云汐终局', detail: '迷雾、风暴与紧预算同时生效，凭记忆一气呵成绘完云径', rows: 9, cols: 9, walk: 36, anchors: 6, storms: 4, fog: true, slack: 4 },
]

export const CLOUD_LEVEL_COUNT = 60

export function chapterOf(level: number) {
  const safe = Math.min(CLOUD_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  return safe <= 44 ? 4 : 5
}

export function getCloudLevel(level: number): CloudLevel {
  const safe = Math.min(CLOUD_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const inChapter = safe - (1 + (chapter - 1) * 11)
  return {
    rows: spec.rows, cols: spec.cols, chapter, walk: spec.walk, anchors: spec.anchors, storms: spec.storms,
    fog: spec.fog, slack: Math.max(2, spec.slack - Math.floor(inChapter / 3)),
    title: safe === CLOUD_LEVEL_COUNT ? '终局·云汐成径' : spec.title, detail: spec.detail,
  }
}
