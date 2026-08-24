import { describe, expect, it } from 'vitest'
import { createSessionEpoch } from './session-epoch'

describe('session epoch', () => {
  it('revokes every callback captured before a transition', () => {
    const epoch = createSessionEpoch()
    const first = epoch.capture()
    expect(epoch.isCurrent(first)).toBe(true)
    expect(epoch.advance()).toBe(1)
    expect(epoch.isCurrent(first)).toBe(false)
    expect(epoch.isCurrent(epoch.capture())).toBe(true)
  })
})
