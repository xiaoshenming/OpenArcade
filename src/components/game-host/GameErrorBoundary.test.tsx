import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameErrorBoundary } from './GameErrorBoundary'

afterEach(() => vi.restoreAllMocks())

describe('game error boundary', () => {
  it('contains a broken trusted module and can recover', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let broken = true
    function Fixture() {
      if (broken) throw new Error('game crashed')
      return <span>game recovered</span>
    }

    const onError = vi.fn()
    render(<GameErrorBoundary resetKey="session-1" onError={onError}><Fixture /></GameErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('卡带启动失败')
    expect(onError).toHaveBeenCalledOnce()

    broken = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByText('game recovered')).toBeInTheDocument()
  })
})
