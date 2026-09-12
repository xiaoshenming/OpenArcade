import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { INGREDIENTS, makeTeaOrder, type TeaLevel } from './levels'

export type TeaPulse = 'good' | 'served' | 'bad' | 'lost'

export interface TeaStep {
  order: number
  ingredient: number
}

export interface TeaActive {
  index: number
  customer: number
  recipe: number[]
  expected: number[]
  reverse: boolean
  progress: number
  lives: number
  done: boolean
  failed: boolean
}

export interface TeaState {
  wave: number
  nextIndex: number
  active: TeaActive[]
  queue: TeaStep[]
  cursor: number
  shelf: number[]
  completed: number
  failedOrders: number
  score: number
  streak: number
  perfectStreak: number
  over: 'playing' | 'completed' | 'failed'
  pulse: TeaPulse
}

export const PER_ORDER_LIVES = 2
export const MAX_FAILED_ORDERS = 3

export function orderScore(multiplier: number, perfectStreak: number) {
  return 150 * multiplier + 10 * Math.min(perfectStreak, 8)
}

function buildActive(level: TeaLevel, from: number, count: number): TeaActive[] {
  return Array.from({ length: count }, (_, slot) => {
    const index = from + slot
    const order = makeTeaOrder(level, index)
    return {
      index, customer: order.customer, recipe: order.recipe, reverse: order.reverse,
      expected: order.reverse ? [...order.recipe].reverse() : order.recipe,
      progress: 0, lives: PER_ORDER_LIVES, done: false, failed: false,
    }
  })
}

function interleave(active: TeaActive[]): TeaStep[] {
  const steps: TeaStep[] = []
  const rounds = Math.max(...active.map((order) => order.expected.length))
  for (let round = 0; round < rounds; round += 1) {
    for (const order of active) {
      if (round < order.expected.length) steps.push({ order: order.index, ingredient: order.expected[round] })
    }
  }
  return steps
}

function buildShelf(level: TeaLevel, wave: number, active: TeaActive[]): number[] {
  const used = new Set(active.flatMap((order) => order.expected))
  const rng = mulberry32(seedFor(level.level, 500 + wave * 17))
  const room = INGREDIENTS.length - used.size
  const extras = shuffle(rng, [0, 1, 2, 3, 4, 5].filter((id) => !used.has(id))).slice(0, Math.min(level.distractors, room))
  return shuffle(rng, [...used, ...extras])
}

export function startWave(level: TeaLevel, wave: number, nextIndex: number, completed: number, failedOrders: number, score: number, streak: number, perfectStreak: number): TeaState {
  const size = Math.max(1, Math.min(level.customers, level.quota - completed))
  const active = buildActive(level, nextIndex, size)
  return {
    wave, nextIndex: nextIndex + size, active, queue: interleave(active), cursor: 0, shelf: buildShelf(level, wave, active),
    completed, failedOrders, score, streak, perfectStreak, over: 'playing', pulse: 'good',
  }
}

export function createTeaState(level: TeaLevel): TeaState {
  return startWave(level, 0, 0, 0, 0, 0, 0, 0)
}

function settle(level: TeaLevel, state: TeaState): TeaState {
  if (state.completed >= level.quota) return { ...state, over: 'completed', pulse: 'served' }
  if (state.failedOrders >= MAX_FAILED_ORDERS) return { ...state, over: 'failed', pulse: 'lost' }
  if (state.active.every((order) => order.done || order.failed)) {
    const next = startWave(level, state.wave + 1, state.nextIndex, state.completed, state.failedOrders, state.score, state.streak, state.perfectStreak)
    return { ...next, pulse: state.pulse }
  }
  return state
}

export function pressTea(level: TeaLevel, state: TeaState, ingredient: number): TeaState {
  if (state.over !== 'playing' || state.cursor >= state.queue.length) return state
  const step = state.queue[state.cursor]
  const active = state.active.map((order) => ({ ...order }))
  const order = active.find((item) => item.index === step.order) ?? active[0]
  if (ingredient === step.ingredient) {
    order.progress += 1
    let { score, perfectStreak, completed } = state
    let pulse: TeaPulse = 'good'
    if (order.progress >= order.expected.length) {
      order.done = true
      completed += 1
      perfectStreak = order.lives >= PER_ORDER_LIVES ? perfectStreak + 1 : 0
      score += orderScore(level.chapter, perfectStreak)
      pulse = 'served'
    }
    const gone = new Set(active.filter((item) => item.done || item.failed).map((item) => item.index))
    const queue = state.queue.filter((item) => !gone.has(item.order))
    const cursor = state.queue.slice(0, state.cursor + 1).filter((item) => !gone.has(item.order)).length
    return settle(level, { ...state, active, queue, cursor, completed, score, streak: state.streak + 1, perfectStreak, pulse })
  }
  order.lives -= 1
  let { queue, cursor } = state
  let pulse: TeaPulse = 'bad'
  if (order.lives <= 0) {
    order.failed = true
    pulse = 'lost'
    queue = state.queue.filter((item) => item.order !== order.index)
    cursor = state.queue.slice(0, state.cursor).filter((item) => item.order !== order.index).length
  }
  return settle(level, {
    ...state, active, queue, cursor, failedOrders: state.failedOrders + (order.failed ? 1 : 0),
    score: state.score, streak: 0, perfectStreak: 0, pulse,
  })
}
