import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import LanternGridGame from './Game'
import { createLanternPuzzle } from './levels'
import { crossOf } from './logic'

afterEach(cleanup)

const cellAria = (level: number, cell: number) => {
  const puzzle = createLanternPuzzle(level)
  const row = Math.floor(cell / puzzle.spec.cols) + 1
  const col = (cell % puzzle.spec.cols) + 1
  return new RegExp(`第${row}行第${col}列`)
}

describe('lantern press tween', () => {
  it('springs the cross of lamps around a press when motion is allowed', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const animate = vi.fn(() => ({ finished: Promise.resolve() }))
    const original = HTMLElement.prototype.animate
    HTMLElement.prototype.animate = animate
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const cell = createLanternPuzzle(34).solution[0]
      const view = render(<LanternGridGame sessionKey={1} paused={false} muted emit={emit} level={34} />)
      const button = view.getByRole('button', { name: cellAria(34, cell) }) as HTMLButtonElement
      const wasLit = button.className.includes('is-lit')
      fireEvent.click(button)
      expect(button.className.includes('is-lit')).toBe(!wasLit)
      expect(view.container.querySelector('.lantern-readout')?.textContent).toContain('1 步 · 参考 17')
      const cross = crossOf(cell, 6, 6)
      expect(animate).toHaveBeenCalledTimes(cross.length)
      expect(animate).toHaveBeenCalledWith(
        [{ transform: 'scale(1)' }, { transform: 'scale(.88)' }, { transform: 'scale(1)' }],
        { duration: 240, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'both', delay: 0 },
      )
    } finally {
      HTMLElement.prototype.animate = original
      vi.unstubAllGlobals()
    }
  })

  it('skips the spring entirely and still toggles lamps when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const animate = vi.fn(() => ({ finished: Promise.resolve() }))
    const original = HTMLElement.prototype.animate
    HTMLElement.prototype.animate = animate
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const puzzle = createLanternPuzzle(35)
      const cell = puzzle.solution[0]
      const view = render(<LanternGridGame sessionKey={1} paused={false} muted emit={emit} level={35} />)
      fireEvent.click(view.getByRole('button', { name: cellAria(35, cell) }))
      expect(animate).not.toHaveBeenCalled()
      expect(view.container.querySelector('.lantern-readout')?.textContent).toContain('1 步 · 参考 16')
      expect(emit.mock.calls.some(([event]) => event.type === 'score')).toBe(true)
    } finally {
      HTMLElement.prototype.animate = original
      vi.unstubAllGlobals()
    }
  })

  it('refuses locked cells without spending a move', () => {
    const emit = vi.fn<(event: GameEvent) => void>()
    const puzzle = createLanternPuzzle(34)
    const lock = puzzle.locks[0]
    const before = puzzle.lights[lock]
    const view = render(<LanternGridGame sessionKey={1} paused={false} muted emit={emit} level={34} />)
    fireEvent.click(view.getByRole('button', { name: cellAria(34, lock) }))
    expect(view.container.querySelector('.lantern-readout')?.textContent).toContain('0 步')
    expect((view.getByRole('button', { name: cellAria(34, lock) }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe(String(before))
    expect(emit.mock.calls.filter(([event]) => event.type === 'score')).toHaveLength(0)
  })
})
