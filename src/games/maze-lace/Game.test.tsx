import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import MazeLaceGame from './Game'

afterEach(cleanup)

const renderGame = (paused = false) => {
  const emit = vi.fn<(event: GameEvent) => void>()
  const view = render(<MazeLaceGame sessionKey={1} paused={paused} muted emit={emit} level={1} />)
  return { emit, view }
}

describe('maze lace game controls', () => {
  it('freezes the submit and restart actions while paused', () => {
    const { view } = renderGame(true)
    const submit = view.getByText('提交校验').closest('button') as HTMLButtonElement
    const restart = view.getByText('重开本关').closest('button') as HTMLButtonElement
    expect(submit).toBeDisabled()
    expect(restart).toBeDisabled()
    const edge = view.container.querySelector('.lace-edge') as HTMLButtonElement
    expect(edge).toBeDisabled()
    fireEvent.click(restart)
    expect(view.container.querySelector('.lace-readout strong')?.textContent).toContain('命 3/3')
  })

  it('deducts a life per invalid submission until the loom jams, then restarts from the stamp', () => {
    const { emit, view } = renderGame()
    const submit = view.getByText('提交校验').closest('button') as HTMLButtonElement
    const restart = view.getByText('重开本关').closest('button') as HTMLButtonElement
    expect(view.container.querySelector('.lace-live')?.textContent).toBe('')
    fireEvent.click(submit)
    expect(view.container.querySelector('.lace-live')?.textContent).toContain('仍有多条通路')
    expect(view.container.querySelector('.lace-readout strong')?.textContent).toContain('命 2/3')
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'failed' }))
    fireEvent.click(submit)
    expect(view.container.querySelector('.lace-live')?.textContent).toContain('余命 1')
    fireEvent.click(submit)
    expect(emit).toHaveBeenCalledWith({ type: 'failed', score: expect.any(Number) })
    expect(view.getByText('LOOM JAMMED')).toBeTruthy()
    expect(submit).toBeDisabled()
    expect(restart).toBeDisabled()
    fireEvent.click(view.getByText('再来一次').closest('button') as HTMLButtonElement)
    expect(view.container.querySelector('.lace-readout strong')?.textContent).toContain('命 3/3')
    expect(restart).not.toBeDisabled()
  })
})
