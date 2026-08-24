import { describe, expect, it, vi } from 'vitest'
import type { IframeManifest } from '../sdk'
import { createChannel, createGameUrl, getIframePolicy } from './iframe-policy'

const game: IframeManifest = {
  id: 'sample', sdkVersion: 1, gameVersion: '1.0.0', owner: '@owner', license: 'MIT',
  title: 'Sample', shortTitle: 'Sample', description: 'Sample game description.',
  category: 'arcade', accent: '#12aabb', order: 1, status: 'ready',
  scorePolicy: { max: 1000, eventsPerSecond: 20 }, loader: 'iframe',
  entry: '/games/sample/index.html', isolation: 'opaque-origin', permissions: [],
}

describe('iframe isolation policy', () => {
  it('never grants same-origin access to community games', () => {
    expect(getIframePolicy(game, 'https://arcade.test')).toEqual({
      sandbox: 'allow-scripts', allow: '', targetOrigin: '*',
    })
  })

  it('maps only declared browser permissions', () => {
    const trusted = { ...game, isolation: 'trusted-same-origin', permissions: ['audio', 'gamepad'] } as IframeManifest
    expect(getIframePolicy(trusted, 'https://arcade.test').allow).toBe('autoplay; gamepad')
    expect(getIframePolicy(trusted, 'https://arcade.test').sandbox).toContain('allow-same-origin')
  })

  it('binds URLs to unguessable per-session channels', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    expect(createChannel()).toBe('aaaaaaaabbbb4ccc8dddeeeeeeeeeeee')
    expect(createGameUrl('/game', '0123456789abcdef', 'https://arcade.test/')).toContain('oa-channel=0123456789abcdef')
    vi.unstubAllGlobals()
  })
})
