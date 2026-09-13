import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import Game from './Game'

afterEach(cleanup)

const renderGame = (paused: boolean) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<Game sessionKey={1} paused={paused} muted emit={emit} level={1} />)
  return { emit, view }
}

const restartButton = (view: ReturnType<typeof render>) =>
  view.getByText('重开本关').closest('button') as HTMLButtonElement

describe('magnet path game controls', () => {
  it('ignores the restart request while paused and answers it while running', () => {
    const frozen = renderGame(true)
    expect(restartButton(frozen.view)).toBeDisabled()
    fireEvent.click(restartButton(frozen.view))
    fireEvent.click(frozen.view.getByText('推进回合'))
    expect(frozen.emit).not.toHaveBeenCalledWith({ type: 'request-restart' })
    expect(frozen.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'score' }))

    const live = renderGame(false)
    frozen.view.unmount()
    expect(restartButton(live.view)).not.toBeDisabled()
    fireEvent.click(restartButton(live.view))
    expect(live.emit).toHaveBeenCalledWith({ type: 'request-restart' })
  })

  it('explains narrow-screen board scrolling and keeps every cell a touch target', () => {
    const { view } = renderGame(false)
    expect(view.getByText('小屏棋盘过宽时，可左右滑动棋盘')).toBeTruthy()
    const cells = view.container.querySelectorAll('.magnet-cell')
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell.tagName).toBe('BUTTON')
  })
})
