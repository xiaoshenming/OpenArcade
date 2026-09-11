import { describe, expect, it, vi } from 'vitest'
import { EASINGS, tween } from './motion'

describe('motion', () => {
  it('exposes shared easing curves', () => {
    expect(EASINGS.spring).toContain('cubic-bezier')
    expect(EASINGS.standard).not.toBe(EASINGS.exit)
  })

  it('resolves instantly without Web Animations support', async () => {
    const element = document.createElement('div')
    await expect(tween(element, [{ opacity: 0 }], { duration: 200 })).resolves.toBeUndefined()
  })

  it('short-circuits tweens when reduced motion is requested', async () => {
    const element = document.createElement('div')
    element.animate = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    await tween(element, [{ opacity: 0 }], { duration: 200 })
    expect(element.animate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
