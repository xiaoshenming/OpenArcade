import { describe, expect, it } from 'vitest'
import {
  applyHit, capScore, clampHp, damageFor, findTarget, judge, MAX_HP, overlapSpan, resolveHit, visualDistance, SCORE_MAX,
  type Chart,
} from './logic'
import {
  chapterOf, densityAt, generateChart, getLaneLevel, LURE_BAR_CHANCE, LEAD_IN_MS, RHYTHM_LEVEL_COUNT, SLOW_SCALE, slotWeight,
} from './levels'

const levels = Array.from({ length: RHYTHM_LEVEL_COUNT }, (_, index) => index + 1)
const charts = new Map(levels.map((level) => [level, generateChart(level)]))
const notesPerSecond = (level: number) => {
  const chart = charts.get(level)!
  return chart.notes.length / (chart.songMs / 1000)
}

describe('rhythm lane judgement windows', () => {
  it('classifies hits by exact millisecond deltas in both directions', () => {
    expect(judge(1000, 1000)).toBe('perfect')
    expect(judge(1000, 940)).toBe('perfect')
    expect(judge(1000, 1060)).toBe('perfect')
    expect(judge(1000, 939)).toBe('good')
    expect(judge(1000, 1061)).toBe('good')
    expect(judge(1000, 1130)).toBe('good')
    expect(judge(1000, 870)).toBe('good')
    expect(judge(1000, 1131)).toBe('miss')
    expect(judge(1000, 869)).toBe('miss')
    expect(judge(Number.NaN, 1000)).toBe('miss')
  })

  it('scores hits with combo bonuses every tenth hit and resets on miss', () => {
    expect(applyHit('perfect', 0)).toMatchObject({ gain: 300, bonus: 0, combo: 1 })
    expect(applyHit('good', 8)).toMatchObject({ gain: 150, bonus: 0, combo: 9 })
    expect(applyHit('perfect', 9)).toMatchObject({ gain: 300, bonus: 50, combo: 10 })
    expect(applyHit('good', 19)).toMatchObject({ gain: 150, bonus: 50, combo: 20 })
    expect(applyHit('miss', 37)).toMatchObject({ gain: 0, bonus: 0, combo: 0 })
    expect(capScore(SCORE_MAX + 4321)).toBe(SCORE_MAX)
    expect(capScore(-8)).toBe(0)
    expect(clampHp(140)).toBe(100)
    expect(clampHp(-3)).toBe(0)
    expect(damageFor('miss', false)).toBe(12)
    expect(damageFor('miss', true)).toBe(6)
    expect(damageFor('good', true)).toBe(4)
  })
})

describe('rhythm lane chart generator', () => {
  it('produces identical seeded charts per level and clamps boundaries', () => {
    for (const level of [1, 12, 23, 34, 45, 60]) expect(generateChart(level)).toEqual(charts.get(level))
    for (const level of [1, 30, 60]) expect(generateChart(level)).toEqual(generateChart(level))
    expect(generateChart(0)).toEqual(generateChart(1))
    expect(generateChart(-4)).toEqual(generateChart(1))
    expect(generateChart(999)).toEqual(generateChart(60))
  })

  it('places every note on the half-beat grid inside the song with valid lanes', () => {
    for (const chart of charts.values()) {
      expect(chart.notes.length).toBeGreaterThan(8)
      const stepMs = chart.beatMs / 2
      for (const note of chart.notes) {
        expect(note.lane).toBeGreaterThanOrEqual(0)
        expect(note.lane).toBeLessThan(4)
        expect(note.time).toBeGreaterThanOrEqual(LEAD_IN_MS)
        expect(note.time).toBeLessThan(chart.songMs)
        const slots = (note.time - LEAD_IN_MS) / stepMs
        expect(Math.abs(slots - Math.round(slots))).toBeLessThan(1e-6)
      }
      for (let index = 1; index < chart.notes.length; index += 1) {
        const pair = [chart.notes[index - 1], chart.notes[index]]
        expect(pair[0].time).toBeLessThanOrEqual(pair[1].time)
      }
    }
  })

  it('follows the sin density curve over slot weights', () => {
    expect(densityAt(0, 0.3, 0.6)).toBeCloseTo(0.3)
    expect(densityAt(1, 0.3, 0.6)).toBeCloseTo(0.3)
    expect(densityAt(0.5, 0.3, 0.6)).toBeCloseTo(0.6)
    expect(densityAt(0.5, 0.3, 0.6)).toBeGreaterThan(densityAt(0.25, 0.3, 0.6))
    expect(densityAt(-0.4, 0.3, 0.6)).toBeCloseTo(0.3)
    expect(slotWeight(0)).toBe(1)
    expect(slotWeight(4)).toBe(0.8)
    expect(slotWeight(2)).toBe(0.55)
    expect(slotWeight(1)).toBe(0.3)
    const spec = getLaneLevel(58)
    expect(densityAt(0.5, spec.base, spec.peak)).toBeGreaterThan(densityAt(0.5, getLaneLevel(2).base, getLaneLevel(2).peak))
  })
})

describe('rhythm lane ghost decoys (chapter 2)', () => {
  it('seeds ghost lures only into chapter 2 charts, at least one per level', () => {
    for (const [level, chart] of charts) {
      const decoys = chart.notes.filter((note) => note.decoy).length
      if (chapterOf(level) === 2) expect(decoys).toBeGreaterThanOrEqual(1)
      else expect(decoys).toBe(0)
    }
    expect(generateChart(16).notes.some((note) => note.decoy)).toBe(true)
    expect(generateChart(11).notes.some((note) => note.decoy)).toBe(false)
    expect(generateChart(23).notes.some((note) => note.decoy)).toBe(false)
  })

  it('keeps the lure rate bounded and never clusters lures inside one bar', () => {
    for (const level of [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) {
      const chart = charts.get(level)!
      const decoys = chart.notes.filter((note) => note.decoy).length
      const rate = decoys / chart.notes.length
      expect(rate).toBeGreaterThan(0.03)
      expect(rate).toBeLessThan(LURE_BAR_CHANCE + 0.05)
      const luredBars = new Set(chart.notes.filter((note) => note.decoy).map((note) => Math.floor((note.time - LEAD_IN_MS) / chart.beatMs / 4)))
      expect(luredBars.size).toBe(decoys)
    }
  })

  it('punishes biting a lure as a miss and resolves targets in favour of real notes', () => {
    const notes = [
      { time: 1000, lane: 1, decoy: false },
      { time: 1060, lane: 1, decoy: true },
      { time: 1000, lane: 2, decoy: false },
    ]
    expect(resolveHit(notes[1], 1060)).toBe('decoy')
    expect(resolveHit(notes[0], 1000)).toBe('perfect')
    expect(resolveHit(notes[0], 1100)).toBe('good')
    expect(resolveHit(notes[0], 1200)).toBe('miss')
    expect(findTarget(notes, [0, 0, 0], 1000, 1)).toBe(0)
    expect(findTarget(notes, [1, 0, 0], 1060, 1)).toBe(1)
    expect(findTarget(notes, [1, 1, 0], 1060, 1)).toBe(-1)
    expect(findTarget(notes, [0, 0, 0], 1060, 2)).toBe(2)
    expect(findTarget(notes, [0, 0, 0], 5000, 0)).toBe(-1)
  })
})

describe('rhythm lane full-combo automaton', () => {
  const realNotes = (chart: Chart) => chart.notes.filter((note) => !note.decoy).length

  // Mirrors the engine loop: every real note is pressed at its judgement center,
  // the expiry sweep then confirms nothing real was left pending.
  const runBot = (chart: Chart) => {
    let score = 0
    let combo = 0
    const statuses = chart.notes.map(() => 0)
    chart.notes.forEach((note, index) => {
      if (note.decoy) return
      expect(findTarget(chart.notes, statuses, note.time, note.lane)).toBe(index)
      const kind = resolveHit(chart.notes[index], note.time)
      expect(kind).toBe('perfect')
      statuses[index] = 1
      const outcome = applyHit(kind, combo)
      combo = outcome.combo
      score = capScore(score + outcome.gain + outcome.bonus)
    })
    return {
      hp: MAX_HP,
      score,
      combo,
      missed: statuses.filter((status, index) => status === 0 && !chart.notes[index].decoy).length,
      fadedLures: statuses.filter((status, index) => status === 0 && chart.notes[index].decoy).length,
    }
  }

  it('full-combos all sixty charts at judgement centers without losing a single hp', () => {
    for (const chart of charts.values()) {
      const run = runBot(chart)
      expect(run.missed).toBe(0)
      expect(run.hp).toBe(MAX_HP)
      expect(run.combo).toBe(realNotes(chart))
      expect(run.fadedLures).toBe(chart.notes.length - realNotes(chart))
      expect(run.score).toBeGreaterThan(0)
      expect(run.score).toBeLessThanOrEqual(SCORE_MAX)
    }
  })

  it('a naive bot that bites every lure bleeds but the disciplined one never does', () => {
    for (const chart of charts.values()) {
      const lures = chart.notes.filter((note) => note.decoy)
      if (lures.length === 0) continue
      let hp = MAX_HP
      for (const lure of lures) {
        expect(resolveHit(lure, lure.time)).toBe('decoy')
        hp = clampHp(hp - damageFor('miss', false))
      }
      expect(hp).toBeLessThan(MAX_HP)
      expect(hp).toBe(clampHp(MAX_HP - lures.length * damageFor('miss', false)))
    }
  })
})

describe('rhythm lane chapter mechanics', () => {
  it('keeps doubles on distinct lanes and only after chapter 3', () => {
    for (const [level, chart] of charts) {
      const byTime = new Map<number, number[]>()
      for (const note of chart.notes) {
        const lanes = byTime.get(note.time) ?? []
        lanes.push(note.lane)
        byTime.set(note.time, lanes)
      }
      for (const lanes of byTime.values()) {
        expect(lanes.length).toBeLessThanOrEqual(2)
        expect(new Set(lanes).size).toBe(lanes.length)
      }
      const doubles = [...byTime.values()].filter((lanes) => lanes.length === 2).length
      if (chapterOf(level) < 3) expect(doubles).toBe(0)
      else if (chapterOf(level) >= 5) expect(doubles).toBeGreaterThan(2)
    }
    const chordTimes = (level: number) => {
      const times = charts.get(level)!.notes.map((note) => note.time)
      return times.filter((time, index) => index > 0 && times[index - 1] === time).length
    }
    expect(chordTimes(23)).toBeGreaterThan(0)
    expect(chordTimes(60)).toBeGreaterThan(2)
    expect(chordTimes(12)).toBe(0)
  })

  it('adds non-overlapping slow windows from chapter 4 and slows the scroll inside them', () => {
    for (const [level, chart] of charts) {
      const expected = chapterOf(level) >= 5 ? 3 : chapterOf(level) === 4 ? 2 : 0
      expect(chart.slowWindows).toHaveLength(expected)
      for (let index = 0; index < chart.slowWindows.length; index += 1) {
        const window = chart.slowWindows[index]
        expect(window.end).toBeGreaterThan(window.start)
        expect(window.start).toBeGreaterThan(LEAD_IN_MS)
        expect(window.end).toBeLessThan(chart.songMs)
        expect(window.scale).toBe(SLOW_SCALE)
        if (index > 0) expect(window.start).toBeGreaterThan(chart.slowWindows[index - 1].end)
      }
    }
    const plain: never[] = []
    expect(visualDistance(1000, 2000, plain, SLOW_SCALE)).toBe(1000)
    expect(visualDistance(2000, 1000, plain, SLOW_SCALE)).toBe(-1000)
    expect(visualDistance(2000, 2000, plain, SLOW_SCALE)).toBe(0)
    const window = [{ start: 1000, end: 2000, scale: SLOW_SCALE }]
    expect(visualDistance(1000, 2000, window, SLOW_SCALE)).toBeCloseTo(1000 * SLOW_SCALE)
    expect(visualDistance(0, 3000, window, SLOW_SCALE)).toBeCloseTo(2000 + 1000 * SLOW_SCALE)
    expect(overlapSpan(1200, 3000, window[0])).toBe(800)
    expect(overlapSpan(3000, 4000, window[0])).toBe(0)
    expect(visualDistance(1500, 1500, window, SLOW_SCALE)).toBe(0)
  })

  it('raises difficulty monotonically across the five chapters and guards warmup hp', () => {
    expect([1, 11, 12, 22, 23, 33, 34, 44, 45, 60].map(chapterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(getLaneLevel(1)).toMatchObject({ bpm: 90, doubles: false, warmup: false, slowWindows: 0 })
    expect(getLaneLevel(16)).toMatchObject({ bpm: 105, doubles: false })
    expect(getLaneLevel(28)).toMatchObject({ doubles: true, slowWindows: 0 })
    expect(getLaneLevel(40)).toMatchObject({ slowWindows: 2, doubles: false })
    expect(getLaneLevel(60)).toMatchObject({ doubles: true, slowWindows: 3, warmup: true })
    const averages = [1, 2, 3, 4, 5].map((chapter) => {
      const scoped = levels.filter((level) => chapterOf(level) === chapter)
      return scoped.reduce((sum, level) => sum + notesPerSecond(level), 0) / scoped.length
    })
    for (let index = 1; index < averages.length; index += 1) expect(averages[index]).toBeGreaterThan(averages[index - 1])
    expect(averages[0]).toBeGreaterThan(0.4)
    expect(getLaneLevel(50).speed).toBeGreaterThan(getLaneLevel(45).speed)
    for (const chart of charts.values()) expect(chart.warmupUntilMs).toBeGreaterThanOrEqual(0)
    for (const [level, chart] of charts) {
      if (chapterOf(level) === 5) expect(chart.warmupUntilMs).toBeGreaterThan(LEAD_IN_MS)
      else expect(chart.warmupUntilMs).toBe(0)
    }
  })
})
