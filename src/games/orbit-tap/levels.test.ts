import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface OrbitApi {
  getLevel: (level: number) => { level: number; duration: number; quota: number; size: number; lifetime: number }
  createPositionGenerator: (level: number) => () => { x: number; y: number }
}

declare global { var OpenArcadeOrbit: OrbitApi | undefined }

beforeEach(() => window.eval(readFileSync('public/games/orbit-tap/levels.js', 'utf8')))
afterEach(() => { delete globalThis.OpenArcadeOrbit })

describe('orbit tap level system', () => {
  it('defines thirty progressively harder bounded levels', () => {
    const api = globalThis.OpenArcadeOrbit!
    const first = api.getLevel(1)
    const last = api.getLevel(30)
    expect(first).toMatchObject({ level: 1, quota: 5, size: 74 })
    expect(last.level).toBe(30)
    expect(last.quota).toBeGreaterThan(first.quota)
    expect(last.size).toBeLessThan(first.size)
    expect(last.lifetime).toBeLessThan(first.lifetime)
    expect(api.getLevel(999)).toEqual(last)
  })

  it('produces deterministic normalized target positions', () => {
    const api = globalThis.OpenArcadeOrbit!
    const first = api.createPositionGenerator(17)
    const second = api.createPositionGenerator(17)
    const points = Array.from({ length: 20 }, () => first())
    expect(points).toEqual(Array.from({ length: 20 }, () => second()))
    expect(points.every(({ x, y }) => x >= 0 && x < 1 && y >= 0 && y < 1)).toBe(true)
  })
})
