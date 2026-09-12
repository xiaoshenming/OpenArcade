import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import WindowSlideGame from './Game'

afterEach(cleanup)

// 第 45 关：第五章迷雾关（fog = true，参考 15 转）
const fogProps = { sessionKey: 1, muted: true, level: 45 }

describe('window slide fog session', () => {
  it('veils the target thumb after eight seconds and re-veils after a four second peek', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const view = render(<WindowSlideGame {...fogProps} paused={false} emit={emit} />)
      const thumb = view.container.querySelector('.ws-thumb') as HTMLElement
      expect(thumb.className).not.toContain('is-fogged')
      expect(thumb.textContent).toContain('目标窗景')
      const peek = view.getByRole('button', { name: '重看目标 −30' }) as HTMLButtonElement
      expect(peek.disabled).toBe(true)

      act(() => { vi.advanceTimersByTime(8000) })
      expect(thumb.className).toContain('is-fogged')
      expect(peek.disabled).toBe(false)

      fireEvent.click(peek)
      expect(thumb.className).not.toContain('is-fogged')
      expect(thumb.textContent).toContain('重看中')
      expect(peek.disabled).toBe(true)
      const scores = emit.mock.calls.filter(([event]) => event.type === 'score')
      expect(scores.at(-1)).toEqual([{ type: 'score', score: 970 }])

      act(() => { vi.advanceTimersByTime(4000) })
      expect(thumb.className).toContain('is-fogged')
      expect(thumb.textContent).toContain('已入雾')
      expect((view.getByRole('button', { name: '重看目标 −30' }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('freezes the fog timer while paused and restarts it on resume', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const view = render(<WindowSlideGame {...fogProps} paused emit={emit} />)
      const thumb = view.container.querySelector('.ws-thumb') as HTMLElement
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(thumb.className).not.toContain('is-fogged')
      expect((view.getByRole('button', { name: '重看目标 −30' }) as HTMLButtonElement).disabled).toBe(true)

      view.rerender(<WindowSlideGame {...fogProps} paused={false} emit={emit} />)
      act(() => { vi.advanceTimersByTime(7999) })
      expect(thumb.className).not.toContain('is-fogged')
      act(() => { vi.advanceTimersByTime(1) })
      expect(thumb.className).toContain('is-fogged')
    } finally {
      vi.useRealTimers()
    }
  })

  it('charges thirty points for every peek while the board stays unsolved', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const view = render(<WindowSlideGame {...fogProps} paused={false} emit={emit} />)
      act(() => { vi.advanceTimersByTime(8000) })
      const peek = view.getByRole('button', { name: '重看目标 −30' })
      fireEvent.click(peek)
      act(() => { vi.advanceTimersByTime(4000) })
      fireEvent.click(view.getByRole('button', { name: '重看目标 −30' }))
      const scoreEvents = emit.mock.calls.map(([event]) => event).filter((event) => event.type === 'score')
      expect(scoreEvents).toEqual([{ type: 'score', score: 970 }, { type: 'score', score: 940 }])
    } finally {
      vi.useRealTimers()
    }
  })
})
