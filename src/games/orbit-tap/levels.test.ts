import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface OrbitLevel { level: number; chapter: number; mode: string; duration: number; quota: number; size: number; lifetime: number; decoys: number; drift: boolean; combo: boolean }
interface OrbitApi {
  getLevel: (level: number) => OrbitLevel
  createPositionGenerator: (level: number, stream?: number) => () => { x: number; y: number }
}

declare global { var OpenArcadeOrbit: OrbitApi | undefined }

beforeEach(() => window.eval(readFileSync('public/games/orbit-tap/levels.js', 'utf8')))
afterEach(() => { delete globalThis.OpenArcadeOrbit })

describe('orbit tap level system', () => {
  it('makes each opening level a different visible mechanic', () => {
    const api = globalThis.OpenArcadeOrbit!
    expect(Array.from({ length: 5 }, (_, index) => api.getLevel(index + 1).mode)).toEqual(['tap', 'hop', 'chase', 'avoid', 'combo'])
    expect(api.getLevel(4).decoys).toBe(1)
    expect(api.getLevel(5).combo).toBe(true)
  })

  it('develops mechanics through six authored chapters and mixed finales', () => {
    const api = globalThis.OpenArcadeOrbit!
    const levels = Array.from({ length: 30 }, (_, index) => api.getLevel(index + 1))
    for (let chapter = 1; chapter <= 6; chapter += 1) {
      expect(levels.slice((chapter - 1) * 5, chapter * 5).every((level) => level.chapter === chapter)).toBe(true)
    }
    expect(api.getLevel(10)).toMatchObject({ decoys: 1, drift: true, combo: true })
    expect(api.getLevel(20)).toMatchObject({ decoys: 1, drift: true, combo: true })
    expect(api.getLevel(30)).toMatchObject({ decoys: 3, drift: true, combo: true })
  })

  it('defines thirty bounded and feasible configurations', () => {
    const api = globalThis.OpenArcadeOrbit!
    const levels = Array.from({ length: 30 }, (_, index) => api.getLevel(index + 1))
    expect(levels[0]).toMatchObject({ level: 1, quota: 5, size: 78, lifetime: 0 })
    expect(levels.at(-1)?.level).toBe(30)
    expect(levels.every((level) => level.size >= 44 && level.quota <= level.duration)).toBe(true)
    expect(new Set(levels.map((level) => JSON.stringify(level))).size).toBe(30)
    expect(api.getLevel(999)).toEqual(levels.at(-1))
    expect(api.getLevel(Number.NaN)).toEqual(levels[0])
  })

  it('produces deterministic isolated normalized position streams', () => {
    const api = globalThis.OpenArcadeOrbit!
    const first = api.createPositionGenerator(17)
    const second = api.createPositionGenerator(17)
    const decoy = api.createPositionGenerator(17, 1)
    const points = Array.from({ length: 20 }, () => first())
    expect(points).toEqual(Array.from({ length: 20 }, () => second()))
    expect(points).not.toEqual(Array.from({ length: 20 }, () => decoy()))
    expect(points.every(({ x, y }) => x >= 0 && x < 1 && y >= 0 && y < 1)).toBe(true)
  })
})
