import { describe, expect, it } from 'vitest'
import { gameManifestSchema } from './schema'

const base = {
  id: 'sample-game', sdkVersion: 1, gameVersion: '1.0.0', owner: '@contributor', license: 'MIT',
  title: 'Sample', shortTitle: 'Sample',
  description: 'A valid sample game.', category: 'arcade', accent: '#12aabb',
  order: 1, status: 'ready', levelCount: 20, scorePolicy: { max: 1000, eventsPerSecond: 20 },
}

describe('game manifest policy', () => {
  it('requires trusted host modules to declare their isolation', () => {
    expect(gameManifestSchema.safeParse({ ...base, loader: 'module', isolation: 'trusted-module' }).success).toBe(true)
    expect(gameManifestSchema.safeParse({ ...base, loader: 'module', isolation: 'opaque-origin' }).success).toBe(false)
  })

  it('defaults community iframe games to explicit capabilities', () => {
    const game = { ...base, loader: 'iframe', entry: '/games/sample-game/index.html', isolation: 'opaque-origin', permissions: [] }
    expect(gameManifestSchema.safeParse(game).success).toBe(true)
    expect(gameManifestSchema.safeParse({ ...game, permissions: ['camera'] }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...game, entry: '//evil.test/game.html' }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...game, entry: '/games/other/index.html' }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...game, entry: '/games/sample-game/../other.html' }).success).toBe(false)
  })

  it('keeps legacy one-level manifests compatible and bounds progressive catalogs', () => {
    const legacy: Record<string, unknown> = { ...base }
    delete legacy.levelCount
    const module = { ...legacy, loader: 'module', isolation: 'trusted-module' }
    expect(gameManifestSchema.safeParse(module).success).toBe(true)
    expect(gameManifestSchema.safeParse({ ...module, levelCount: 0 }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...module, levelCount: 2.5 }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...module, levelCount: 501 }).success).toBe(false)
  })

  it('rejects unsupported SDK versions and malformed identifiers', () => {
    const game = { ...base, loader: 'module', isolation: 'trusted-module' }
    expect(gameManifestSchema.safeParse({ ...game, sdkVersion: 2 }).success).toBe(false)
    expect(gameManifestSchema.safeParse({ ...game, id: '../escape' }).success).toBe(false)
  })
})
