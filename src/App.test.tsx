import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from './sdk'

const host = vi.hoisted(() => ({ callbacks: [] as ((event: GameEvent) => void)[] }))
vi.mock('./components/GameHost', () => ({
  GameHost: ({ onEvent }: { onEvent: (event: GameEvent) => void }) => {
    host.callbacks.push(onEvent)
    return <div data-testid="mock-game" />
  },
}))

import App from './App'

beforeEach(() => { localStorage.clear(); host.callbacks.length = 0 })
afterEach(() => cleanup())

describe('App session authority', () => {
  it('rejects a trusted module callback retained after a game transition', async () => {
    const diagnostics: unknown[] = []
    const listener = (event: Event) => diagnostics.push((event as CustomEvent).detail)
    window.addEventListener('openarcade:diagnostic', listener)
    const view = render(<App />)
    expect(view.queryByTestId('mock-game')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '开始第 1 关' }))
    await waitFor(() => expect(view.getByTestId('mock-game')).toBeTruthy())
    const retained = host.callbacks.at(-1)!
    act(() => {
      retained({ type: 'ready' })
      retained({ type: 'started' })
    })

    fireEvent.click(view.getByRole('button', { name: /星点节拍/ }))
    await waitFor(() => expect(view.getByRole('heading', { name: '星点节拍' })).toBeTruthy())
    act(() => retained({ type: 'completed', score: 1000 }))

    expect(diagnostics).toContainEqual(expect.objectContaining({ gameId: 'water-sort', reason: 'stale-session' }))
    expect(view.container.querySelector('.lobby-progress strong')).toHaveTextContent('0000')
    window.removeEventListener('openarcade:diagnostic', listener)
  })

  it('pauses authority in the lobby and resumes the same attempt', async () => {
    const diagnostics: unknown[] = []
    const listener = (event: Event) => diagnostics.push((event as CustomEvent).detail)
    window.addEventListener('openarcade:diagnostic', listener)
    const view = render(<App />)
    fireEvent.click(view.getByRole('button', { name: '开始第 1 关' }))
    await waitFor(() => expect(view.getByTestId('mock-game')).toBeTruthy())
    const retained = host.callbacks.at(-1)!
    act(() => {
      retained({ type: 'ready' })
      retained({ type: 'started' })
      retained({ type: 'score', score: 100 })
    })

    fireEvent.click(view.getByRole('button', { name: '返回游戏大厅' }))
    act(() => retained({ type: 'score', score: 900 }))
    expect(diagnostics).toContainEqual(expect.objectContaining({ gameId: 'water-sort', reason: 'lobby-session' }))
    fireEvent.click(view.getByRole('button', { name: '继续第 1 关' }))
    act(() => retained({ type: 'score', score: 200 }))
    expect(view.container.querySelector('.score-block strong')).toHaveTextContent('0200')
    window.removeEventListener('openarcade:diagnostic', listener)
  })
})
