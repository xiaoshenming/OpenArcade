export type PagodaMode = 'classic' | 'rationed' | 'quad' | 'sealed' | 'rainbow'

export interface PagodaLevel {
  level: number
  chapter: number
  mode: PagodaMode
  pegs: number
  discs: number
  par: number
  budget?: number
  lockedPeg?: number
  unlockAfter?: number
  rainbow: boolean
  title: string
  detail: string
}

export const PAGODA_LEVEL_COUNT = 60

const FRAME_STEWART = [0, 1, 3, 5, 9, 13, 17, 25, 33, 41, 49, 65, 81] as const
const RAINBOW_PAR = [0, 0, 0, 0, 0, 0, 17, 25, 33] as const
const SEALED_STEPS = [2, 3, 4, 5, 3, 4, 5, 6, 4, 5, 6] as const

const chapterCopy = [
  ['初启·三柱', '把左柱金塔完整搬到最右柱，大盘永不压小盘'],
  ['量入·步约', '步数预算为参考解 1.25 倍，耗尽即刻失败'],
  ['广厦·四柱', '第四根石柱入场，按 Frame-Stewart 路线省步'],
  ['封印·中柱', '中柱封印若干步后自动解封，提前规划绕行'],
  ['虹律·终局', '同色盘不相邻，彩虹律与步数预算同时生效'],
] as const

export function chapterOf(level: number) {
  return level <= 11 ? 1 : level <= 22 ? 2 : level <= 33 ? 3 : level <= 44 ? 4 : 5
}

export const sealedPar = (discs: number, unlockAfter: number) => 2 ** discs - 1 + unlockAfter - ((unlockAfter % 2) & (discs % 2))

export function getPagodaLevel(level: number): PagodaLevel {
  const safe = Math.min(PAGODA_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const chapter = chapterOf(safe)
  const [title, detail] = chapterCopy[chapter - 1]
  if (chapter === 1) {
    const discs = safe <= 3 ? 3 : safe <= 7 ? 4 : 5
    return { level: safe, chapter, mode: 'classic', pegs: 3, discs, par: 2 ** discs - 1, rainbow: false, title, detail }
  }
  if (chapter === 2) {
    const discs = safe <= 16 ? 6 : 7
    const par = 2 ** discs - 1
    const budget = Math.ceil(par * 1.25)
    return { level: safe, chapter, mode: 'rationed', pegs: 3, discs, par, budget, rainbow: false, title, detail: `${detail}（上限 ${budget} 步）` }
  }
  if (chapter === 3) {
    const discs = safe <= 26 ? 8 : safe <= 30 ? 9 : 10
    return { level: safe, chapter, mode: 'quad', pegs: 4, discs, par: FRAME_STEWART[discs], rainbow: false, title, detail }
  }
  if (chapter === 4) {
    const discs = safe <= 37 ? 5 : safe <= 41 ? 6 : 7
    const unlockAfter = SEALED_STEPS[safe - 34]
    return {
      level: safe, chapter, mode: 'sealed', pegs: 3, discs, par: sealedPar(discs, unlockAfter),
      lockedPeg: 1, unlockAfter, rainbow: false, title, detail: `${detail}（封印 ${unlockAfter} 步）`,
    }
  }
  const discs = safe <= 49 ? 6 : safe <= 55 ? 7 : 8
  const par = RAINBOW_PAR[discs]
  const budget = Math.ceil(par * 1.25)
  return {
    level: safe, chapter, mode: 'rainbow', pegs: 4, discs, par, budget, rainbow: true,
    title: safe === PAGODA_LEVEL_COUNT ? '终局·万相归塔' : title, detail: `${detail}（上限 ${budget} 步）`,
  }
}
