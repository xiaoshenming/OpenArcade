export const PAIR_SYMBOLS = ['✿', '♥', '★', '☀', '♫', '☕', '☾', '♦', '♣', '♠', '❋', '●', '▲', '◆'] as const
export type PairMode = 'classic' | 'limited' | 'sequence' | 'shifting' | 'ordered-shift' | 'limited-shift' | 'gauntlet'
export type PreviewMode = 'all' | 'pulse' | 'none'

export interface PairLevel {
  rows: number
  columns: number
  previewMs: number
  previewMode: PreviewMode
  mismatchMs: number
  seed: number
  chapter: number
  mode: PairMode
  title: string
  detail: string
  maxMistakes?: number
  sequence: boolean
  shifting: boolean
}

const opening = [
  { rows: 2, columns: 2, mode: 'classic', previewMode: 'all', title: '初见·两对', detail: '用四张牌熟悉配对' },
  { rows: 2, columns: 3, mode: 'classic', previewMode: 'pulse', title: '逐张闪记', detail: '预览时每次只亮一张牌' },
  { rows: 2, columns: 4, mode: 'limited', previewMode: 'all', title: '失误预算', detail: '只有两次翻错机会' },
  { rows: 3, columns: 4, mode: 'sequence', previewMode: 'all', title: '指定花色', detail: '按顶部目标依次完成' },
  { rows: 4, columns: 4, mode: 'shifting', previewMode: 'all', title: '流动牌阵', detail: '每配成一对，余牌换位' },
] as const
const chapterCopy = [
  ['闪记训练', '预览从全景逐步收紧到无提示'], ['失误边界', '失误预算逐关减少'], ['花色次序', '只能完成当前指定图案'],
  ['流动牌阵', '每次配对后未完成卡片换位'], ['风中次序', '按指定花色配对后牌阵换位'],
  ['易碎牌阵', '换位同时受到失误预算限制'], ['终局花阵', '次序、换位与失误预算同时生效'],
] as const

export function getPairLevel(level: number): PairLevel {
  const safe = Math.min(40, Math.max(1, Math.floor(level)))
  const chapter = Math.floor((safe - 1) / 5) + 1
  const variant = (safe - 1) % 5
  if (safe <= 5) {
    const preset = opening[safe - 1]
    return { ...preset, previewMs: 1900 - safe * 80, mismatchMs: 720 - safe * 8, maxMistakes: safe === 3 ? 2 : undefined, sequence: safe === 4, shifting: safe === 5, chapter, seed: (safe * 2654435761) >>> 0 }
  }
  const sequence = chapter === 4 || chapter === 6 || chapter === 8
  const shifting = chapter >= 5
  const limited = chapter === 3 || chapter === 7 || chapter === 8 || chapter === 2 && variant === 4
  const mode: PairMode = sequence && shifting && limited ? 'gauntlet' : sequence && shifting ? 'ordered-shift' : shifting && limited ? 'limited-shift' : sequence ? 'sequence' : shifting ? 'shifting' : limited ? 'limited' : 'classic'
  const previewMode: PreviewMode = chapter === 2 ? (variant === 0 ? 'all' : variant < 3 ? 'pulse' : 'none') : variant < 2 ? 'pulse' : 'none'
  const maxMistakes = limited ? Math.max(2, 6 - variant - Math.floor(chapter / 4)) : undefined
  const [title, detail] = chapterCopy[chapter - 2]
  return {
    rows: 4, columns: safe >= 31 ? 5 : 4, previewMs: previewMode === 'none' ? 0 : Math.max(430, 1800 - safe * 28),
    previewMode, mismatchMs: Math.max(340, 720 - safe * 8), chapter, mode, title: safe === 40 ? '终局·万花流转' : title,
    detail: maxMistakes ? `${detail} · 可失误 ${maxMistakes} 次` : detail, maxMistakes, sequence, shifting,
    seed: (safe * 2654435761) >>> 0,
  }
}

function random(seed: number) {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function createPairDeck(level: number) {
  const spec = getPairLevel(level)
  const pairCount = spec.rows * spec.columns / 2
  const offset = (level * 3) % PAIR_SYMBOLS.length
  const selected = Array.from({ length: pairCount }, (_, index) => PAIR_SYMBOLS[(offset + index) % PAIR_SYMBOLS.length])
  const deck = [...selected, ...selected]
  const next = random(spec.seed)
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1))
    ;[deck[index], deck[target]] = [deck[target], deck[index]]
  }
  return deck
}

export function rotateUnmatched<T>(deck: readonly T[], matched: readonly number[]) {
  const open = deck.map((_, index) => index).filter((index) => !matched.includes(index))
  if (open.length < 2) return [...deck]
  const values = open.map((index) => deck[index])
  const next = [...deck]
  open.forEach((index, offset) => { next[index] = values[(offset + values.length - 1) % values.length] })
  return next
}

export function nextSequenceTarget<T>(deck: readonly T[], matched: readonly number[]) {
  return deck.find((_, index) => !matched.includes(index))
}
