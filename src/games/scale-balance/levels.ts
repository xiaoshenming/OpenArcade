import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { type BalanceSpec, type PoolWeight, type ScaleSpec } from './logic'

export const BALANCE_LEVELS = 60

export interface BalanceLevel extends BalanceSpec {
  level: number
  chapter: number
  title: string
  detail: string
}

interface Plan {
  start: number
  scales: (index: number) => number
  chain: number
  slots: (index: number) => number
  decoys: (index: number) => number
  slack?: (index: number) => number
  time?: (index: number) => number
}

const plans: Plan[] = [
  { start: 1, scales: () => 2, chain: 0, slots: (index) => (index < 6 ? 1 : 2), decoys: (index) => 2 + Math.floor(index / 6) },
  { start: 12, scales: () => 3, chain: 0, slots: (index) => (index < 6 ? 1 : 2), decoys: (index) => 3 + Math.floor(index / 6) },
  { start: 23, scales: () => 3, chain: 2, slots: (index) => (index < 6 ? 2 : 3), decoys: (index) => 4 + Math.floor(index / 6) },
  { start: 34, scales: () => 3, chain: 2, slots: (index) => (index < 6 ? 2 : 3), decoys: (index) => 5 + Math.floor(index / 6), slack: (index) => Math.max(3, 6 - index) },
  { start: 45, scales: (index) => (index < 8 ? 3 : 4), chain: 3, slots: (index) => (index < 12 ? 2 : 3), decoys: (index) => 6 + Math.floor(index / 8), slack: (index) => Math.max(3, 5 - Math.floor(index / 4)), time: (index) => Math.max(75, 110 - index * 5) },
]

const chapterCopy = [
  ['双双对座', '两架天平各自为政，从砝码池挑码配平右盘'],
  ['三架同台', '三架天平一起登场，先估总量再挑砝码'],
  ['挂秤递推', '右盘挂着小天平，先解下层再平上层'],
  ['迷码预算', '干扰砝码变多且放置计预算，误提交扣命'],
  ['三层秤塔', '三层链秤、预算与限时齐压，逐层递推收官'],
] as const

export function chapterOf(level: number) {
  return level <= 11 ? 1 : level <= 22 ? 2 : level <= 33 ? 3 : level <= 44 ? 4 : 5
}

function splitWeights(total: number, rng: () => number): number[] {
  let parts = Math.min(3, Math.max(1, Math.ceil(total / 45)))
  if (parts < 3 && total >= (parts + 1) * 2 && rng() < 0.35) parts += 1
  const out: number[] = []
  for (let rest = parts; rest > 1; rest -= 1) {
    const low = Math.max(1, total - 45 * (rest - 1))
    const high = Math.min(45, total - (rest - 1))
    const take = low + Math.floor(rng() * (high - low + 1))
    out.push(take)
    total -= take
  }
  out.push(total)
  return out
}

export function getBalanceLevel(level: number): BalanceLevel {
  const safe = Math.min(BALANCE_LEVELS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  let planIndex = 0
  plans.forEach((plan, index) => {
    if (safe >= plan.start) planIndex = index
  })
  const plan = plans[planIndex]
  const index = safe - plan.start
  const rng = mulberry32(seedFor(safe, 49))
  const scaleCount = plan.scales(index)
  const chainDepth = Math.min(plan.chain, scaleCount)
  const slotsBase = plan.slots(index)
  const scales: ScaleSpec[] = Array.from({ length: scaleCount }, (_, which) => ({
    left: [],
    slots: which < chainDepth ? Math.min(2, slotsBase) : slotsBase,
    child: which < chainDepth - 1 ? which + 1 : null,
  }))
  let cursor = 0
  const solution: number[][] = []
  const placedSums: number[] = []
  const solutionValues: number[][] = []
  for (const scale of scales) {
    const values = Array.from({ length: scale.slots }, () => 1 + Math.floor(rng() * 9))
    placedSums.push(values.reduce((sum, value) => sum + value, 0))
    solutionValues.push(values)
    solution.push(values.map((_, slot) => cursor + slot))
    cursor += scale.slots
  }
  const decoyCount = plan.decoys(index)
  const decoyValues = Array.from({ length: decoyCount }, () => 1 + Math.floor(rng() * 9))
  const pool: PoolWeight[] = shuffle(rng, [...solutionValues.flat(), ...decoyValues].map((weight, id) => ({ id, weight })))
  const lefts: number[][] = Array.from({ length: scaleCount }, () => [])
  const totals = new Array<number>(scaleCount).fill(0)
  for (let which = scaleCount - 1; which >= 0; which -= 1) {
    const child = scales[which].child
    const hanging = child === null ? 0 : totals[child]
    lefts[which] = splitWeights(hanging + placedSums[which], rng)
    scales[which].left = lefts[which]
    totals[which] = lefts[which].reduce((sum, value) => sum + value, 0) + placedSums[which] + hanging
  }
  const par = cursor
  const moveLimit = plan.slack ? par + plan.slack(index) : undefined
  const timeLimit = plan.time ? plan.time(index) : undefined
  const [title, base] = chapterCopy[planIndex]
  const bits = [
    chainDepth >= 2 ? `${chainDepth} 层链秤` : '',
    decoyCount >= 5 ? `干扰砝码 ${decoyCount}` : '',
    moveLimit ? `预算 ${moveLimit} 步` : '',
    timeLimit ? `限时 ${timeLimit} 秒` : '',
  ].filter(Boolean).join(' · ')
  return {
    level: safe,
    chapter: planIndex + 1,
    scales,
    pool,
    solution,
    par,
    moveLimit,
    timeLimit,
    title,
    detail: bits ? `${base} · ${bits}` : base,
  }
}
