import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import FoldCraftGame from './Game'
import { getFoldLevel } from './levels'

afterEach(cleanup)

describe('fold craft timed session', () => {
  it('keeps the second-based timer phase when a wrong submit rebuilds nothing', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const spec = getFoldLevel(45)
      const view = render(<FoldCraftGame sessionKey={1} paused={false} muted emit={emit} level={45} />)
      const readout = () => view.container.querySelector('.fold-readout span')!.textContent!
      act(() => { vi.advanceTimersByTime(3600) })
      expect(readout()).toContain('3s')
      // 标记一个错误孔位并提交：计时 interval 不得因报错重建（重建会把下一次跳秒推迟整秒）
      const badCell = Array.from({ length: spec.rows * spec.cols }, (_, cell) => cell).find((cell) => !spec.answer.includes(cell))!
      fireEvent.click(view.getByRole('button', { name: `原纸第 ${Math.floor(badCell / spec.cols) + 1} 行第 ${(badCell % spec.cols) + 1} 列` }))
      fireEvent.click(view.getByRole('button', { name: '穿孔验证' }))
      act(() => { vi.advanceTimersByTime(400) })
      expect(readout()).toContain('4s')
    } finally {
      vi.useRealTimers()
    }
  })

  it('turns the readout red for the last five seconds and times out at the limit', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const spec = getFoldLevel(45)
      const view = render(<FoldCraftGame sessionKey={1} paused={false} muted emit={emit} level={45} />)
      act(() => { vi.advanceTimersByTime((spec.par - 6) * 1000) })
      expect(view.container.querySelector('.fold-readout span.is-urgent')).toBeNull()
      act(() => { vi.advanceTimersByTime(2000) })
      expect(view.container.querySelector('.fold-readout span.is-urgent')).not.toBeNull()
      act(() => { vi.advanceTimersByTime(4000) })
      expect(view.container.querySelector('.fold-banner.is-lose')?.textContent).toContain('时限已至')
      expect(emit.mock.calls.some(([event]) => event.type === 'failed')).toBe(true)
      // 终局后计时冻结
      act(() => { vi.advanceTimersByTime(5000) })
      expect(view.container.querySelector('.fold-readout span')!.textContent).toContain(`${spec.par}s`)
    } finally {
      vi.useRealTimers()
    }
  })
})
