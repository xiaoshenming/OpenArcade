import { describe, expect, it } from 'vitest'
import { createTeaState, MAX_FAILED_ORDERS, orderScore, pressTea, PER_ORDER_LIVES, startWave } from './logic'
import { getTeaLevel, INGREDIENTS, makeTeaOrder } from './levels'

const queueIngredients = (state: ReturnType<typeof createTeaState>) => state.queue.map((step) => step.ingredient)

describe('tea order generation', () => {
  it('generates sixty levels of deterministic, bounded orders', () => {
    for (let level = 1; level <= 60; level += 1) {
      const spec = getTeaLevel(level)
      for (let index = 0; index < 8; index += 1) {
        const first = makeTeaOrder(spec, index)
        const second = makeTeaOrder(spec, index)
        expect(first).toEqual(second)
        expect(first.recipe.length).toBeGreaterThanOrEqual(spec.minLen)
        expect(first.recipe.length).toBeLessThanOrEqual(spec.maxLen)
        expect(first.recipe.every((id) => id >= 0 && id < INGREDIENTS.length)).toBe(true)
        expect(first.customer).toBe(index % spec.customers)
      }
    }
  })

  it('keeps shelf free of duplicates and respects distractor budget', () => {
    for (let level = 1; level <= 60; level += 1) {
      const spec = getTeaLevel(level)
      for (let wave = 0; wave < 3; wave += 1) {
        const offset = wave * spec.customers
        const waveState = startWave(spec, wave, offset, 0, 0, 0, 0, 0)
        expect(new Set(waveState.shelf).size).toBe(waveState.shelf.length)
        expect(waveState.shelf.length).toBeLessThanOrEqual(6)
        const used = new Set(waveState.active.flatMap((order) => order.expected))
        expect(waveState.shelf.filter((id) => used.has(id))).toHaveLength(used.size)
      }
    }
  })
})

describe('brewing state machine', () => {
  it('serves every quota order on a clean run of level 1', () => {
    const spec = getTeaLevel(1)
    let state = createTeaState(spec)
    let guard = 0
    while (state.over === 'playing' && guard < 40) {
      guard += 1
      const ingredients = queueIngredients(state)
      for (const ingredient of ingredients) {
        state = pressTea(spec, state, ingredient)
        expect(state.over).not.toBe('failed')
      }
      expect(state.completed).toBeGreaterThan(0)
    }
    expect(state.over).toBe('completed')
    expect(state.completed).toBe(spec.quota)
    expect(state.score).toBe(orderScore(1, 1) + orderScore(1, 2) + orderScore(1, 3))
    expect(state.score).toBeLessThanOrEqual(5000)
  })

  it('charges two lives per order and fails the level after three lost orders', () => {
    const spec = getTeaLevel(1)
    let state = createTeaState(spec)
    const wrong = (state.queue[0].ingredient + 1) % INGREDIENTS.length
    state = pressTea(spec, state, wrong)
    expect(state.active[0].lives).toBe(PER_ORDER_LIVES - 1)
    expect(state.queue).toEqual(createTeaState(spec).queue)
    state = pressTea(spec, state, wrong)
    expect(state.failedOrders).toBe(1)
    expect(state.wave).toBe(1)
    let failures = 1
    let guard = 0
    while (state.over === 'playing' && guard < 40) {
      guard += 1
      const bad = (state.queue[0].ingredient + 1) % INGREDIENTS.length
      state = pressTea(spec, state, bad)
      state = pressTea(spec, state, bad)
      failures += 1
      expect(state.failedOrders).toBe(failures)
    }
    expect(state.over).toBe('failed')
    expect(state.failedOrders).toBe(MAX_FAILED_ORDERS)
  })

  it('mixes distractor ingredients into the shelf and punishes tapping them', () => {
    for (const level of [45, 50, 60]) {
      const spec = getTeaLevel(level)
      expect(spec.distractors, `level ${level}`).toBeGreaterThan(0)
      const solo = startWave(spec, 3, 6, spec.quota - 1, 0, 0, 0, 0)
      expect(solo.active, `level ${level}`).toHaveLength(1)
      const used = new Set(solo.active.flatMap((order) => order.expected))
      const extras = solo.shelf.filter((id) => !used.has(id))
      expect(extras.length, `level ${level}`).toBe(Math.min(spec.distractors, INGREDIENTS.length - used.size))
      expect(extras.length, `level ${level}`).toBeGreaterThan(0)
      const wrong = pressTea(spec, solo, extras[0])
      expect(wrong.active[0].lives, `level ${level}`).toBe(PER_ORDER_LIVES - 1)
      expect(wrong.pulse, `level ${level}`).toBe('bad')
    }
    for (const level of [1, 15, 30]) expect(getTeaLevel(level).distractors).toBe(0)
  })

  it('brews reversed recipes for flagged customers', () => {
    const flagged = Array.from({ length: 11 }, (_, i) => getTeaLevel(34 + i))
      .some((spec) => makeTeaOrder(spec, 0).reverse || makeTeaOrder(spec, 1).reverse)
    expect(flagged).toBe(true)
    for (let level = 34; level <= 44; level += 1) {
      const spec = getTeaLevel(level)
      const state = createTeaState(spec)
      for (const order of state.active) {
        const source = makeTeaOrder(spec, order.index)
        expect(order.expected).toEqual(order.reverse ? [...source.recipe].reverse() : source.recipe)
        if (order.reverse && order.index === state.active[0].index && source.recipe[0] !== order.expected[0]) {
          const forward = pressTea(spec, state, source.recipe[0])
          expect(forward.active[0].lives).toBe(PER_ORDER_LIVES - 1)
        }
      }
    }
  })
})

describe('difficulty curve and boundaries', () => {
  it('escalates chapters without easing later ones', () => {
    const levels = Array.from({ length: 60 }, (_, i) => getTeaLevel(i + 1))
    const chapterAvg = (chapter: number) => {
      const slice = levels.filter((spec) => spec.chapter === chapter)
      const orders = slice.flatMap((spec) => Array.from({ length: 8 }, (_, i) => makeTeaOrder(spec, i)))
      return orders.reduce((sum, order) => sum + order.recipe.length, 0) / orders.length
    }
    for (let chapter = 2; chapter <= 5; chapter += 1) {
      expect(chapterAvg(chapter)).toBeGreaterThan(chapterAvg(chapter - 1))
      expect(levels[chapter * 11].customers).toBeGreaterThanOrEqual(levels[chapter * 11 - 12].customers)
    }
    expect(levels.every((spec) => (spec.chapter === 2 || spec.chapter === 5) === (spec.fadeMs > 0))).toBe(true)
    expect(levels.some((spec) => spec.distractors === 0)).toBe(true)
    expect(levels[44].distractors).toBeGreaterThan(0)
    expect(levels.every((spec) => (spec.reverseChance > 0) === (spec.chapter >= 4))).toBe(true)
    expect(levels[59].bias).toBeGreaterThan(levels[0].bias)
  })

  it('clamps out-of-range levels and ignores presses after the game ends', () => {
    expect(getTeaLevel(0).level).toBe(1)
    expect(getTeaLevel(-4).level).toBe(1)
    expect(getTeaLevel(99).level).toBe(60)
    expect(getTeaLevel(Number.NaN).level).toBe(1)
    const spec = getTeaLevel(1)
    let state = createTeaState(spec)
    while (state.over === 'playing') state = pressTea(spec, state, state.queue[0].ingredient)
    const frozen = state
    expect(pressTea(spec, frozen, 0)).toBe(frozen)
    const drained = { ...createTeaState(spec), cursor: 99 }
    expect(pressTea(spec, drained, 0)).toBe(drained)
  })
})
