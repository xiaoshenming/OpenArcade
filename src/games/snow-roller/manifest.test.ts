import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gameManifestSchema } from '../../sdk'

describe('snow-roller manifest', () => {
  it('parses against the strict SDK schema with a matching id', () => {
    const raw = JSON.parse(readFileSync('src/games/snow-roller/game.json', 'utf8'))
    const manifest = gameManifestSchema.parse(raw)
    expect(manifest.id).toBe('snow-roller')
    expect(manifest.levelCount).toBe(60)
    expect(manifest.order).toBe(60)
    expect(manifest.scorePolicy).toEqual({ max: 10000, eventsPerSecond: 30 })
  })
})
