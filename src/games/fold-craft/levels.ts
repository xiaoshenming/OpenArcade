import { mulberry32, pick, seedFor, shuffle } from '../../platform/rng'
import { trackFolds, twinPosition, unfoldHoles, unfoldMirrorPunch, type FoldAxis } from './logic'

export const FOLD_LEVELS = 60

export interface FoldLevel {
  level: number
  rows: number
  cols: number
  chapter: number
  folds: FoldAxis[]
  frames: { rows: number; cols: number }[]
  folded: { rows: number; cols: number }
  holes: number[]
  answer: number[]
  par: number
  mirror: boolean
  timed: boolean
  title: string
  detail: string
}

interface Plan {
  start: number
  rows: number
  cols: number
  folds: number
  holes: (index: number) => number
  mirror?: boolean
  timed?: boolean
  par: (answer: number, index: number) => number
}

const plans: Plan[] = [
  { start: 1, rows: 4, cols: 4, folds: 1, holes: () => 1, par: (answer, index) => Math.max(18, 26 - index + answer) },
  { start: 12, rows: 4, cols: 4, folds: 2, holes: () => 1, par: (answer, index) => Math.max(22, 34 - index + answer) },
  { start: 23, rows: 8, cols: 8, folds: 3, holes: (index) => (index < 4 ? 1 : index < 8 ? 2 : 3), par: (answer, index) => Math.max(30, 48 - index + answer) },
  { start: 34, rows: 8, cols: 8, folds: 3, holes: (index) => (index < 8 ? 1 : 2), mirror: true, par: (answer, index) => Math.max(34, 54 - index + answer) },
  { start: 45, rows: 8, cols: 8, folds: 4, holes: (index) => (index < 8 ? 1 : 2), timed: true, par: (answer, index) => Math.max(40, 70 - index + answer * 2) },
]

const chapterCopy = [
  ['一折初试', '单次对折：穿孔会同时洞穿叠在一起的两层'],
  ['两折成形', '连续两次对折，每个孔展开为四个落点'],
  ['三折多孔', '三次折叠加多枚穿刺，逐层推演落点'],
  ['镜像暗门', '每个穿刺点都会在中心对称位自动开第二孔，两处落点都要标记'],
  ['四折限时', '四次折叠、多孔与限时硬超时同时生效，超时即判负'],
] as const

function generateFolds(rows: number, cols: number, count: number, rng: () => number) {
  const folds: FoldAxis[] = []
  let height = rows
  let width = cols
  for (let step = 0; step < count; step += 1) {
    const options: FoldAxis[] = []
    if (width % 2 === 0) options.push('left', 'right')
    if (height % 2 === 0) options.push('up', 'down')
    const fold = pick(rng, options)
    folds.push(fold)
    if (fold === 'left' || fold === 'right') width /= 2
    else height /= 2
  }
  return folds
}

export function getFoldLevel(level: number): FoldLevel {
  const safe = Math.min(FOLD_LEVELS, Math.max(1, Math.floor(level) || 1))
  let planIndex = 0
  plans.forEach((plan, index) => {
    if (safe >= plan.start) planIndex = index
  })
  const plan = plans[planIndex]
  const index = safe - plan.start
  const rng = mulberry32(seedFor(safe, 31))
  const folds = generateFolds(plan.rows, plan.cols, plan.folds, rng)
  const track = trackFolds(plan.rows, plan.cols, folds)
  const positions = track.state.rows * track.state.cols
  const holeCount = plan.holes(index)
  const pool = shuffle(rng, Array.from({ length: positions }, (_, position) => position))
  const holes: number[] = []
  if (plan.mirror) {
    // 镜像章：孪生位成对占用，穿刺与其中心对称位不会同时入选。
    for (const position of pool) {
      if (holes.length >= holeCount) break
      const twin = twinPosition(position, track.state.rows, track.state.cols)
      if (holes.includes(position) || holes.includes(twin)) continue
      holes.push(position)
    }
  } else {
    pool.slice(0, holeCount).forEach((position) => holes.push(position))
  }
  holes.sort((a, b) => a - b)
  const answer = plan.mirror ? unfoldMirrorPunch(track.state, holes) : unfoldHoles(track.state, holes)
  const par = plan.par(answer.length, index)
  const [title, base] = chapterCopy[planIndex]
  return {
    level: safe,
    rows: plan.rows,
    cols: plan.cols,
    chapter: planIndex + 1,
    folds,
    frames: track.frames,
    folded: { rows: track.state.rows, cols: track.state.cols },
    holes,
    answer,
    par,
    mirror: Boolean(plan.mirror),
    timed: Boolean(plan.timed),
    title,
    detail: planIndex === 4 ? `${base} · 限时 ${par} 秒` : base,
  }
}
