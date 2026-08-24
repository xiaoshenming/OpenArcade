import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IframeManifest } from '../../sdk'
import { IframeGame } from './IframeGame'

class FakePort {
  onmessage: ((message: MessageEvent) => void) | null = null
  messages: unknown[] = []
  postMessage(message: unknown) { this.messages.push(message) }
  start() {}
  close() {}
}

const channels: { port1: FakePort; port2: FakePort }[] = []
class FakeMessageChannel {
  port1 = new FakePort()
  port2 = new FakePort()
  constructor() { channels.push(this) }
}

const game: IframeManifest = {
  id: 'orbit', sdkVersion: 1, gameVersion: '1.0.0', owner: '@owner', license: 'MIT',
  title: 'Orbit', shortTitle: 'Orbit', description: 'A level game.', category: 'arcade', accent: '#123456',
  order: 1, status: 'ready', levelCount: 30, scorePolicy: { max: 1000, eventsPerSecond: 20 },
  loader: 'iframe', entry: '/games/orbit/index.html', isolation: 'opaque-origin', permissions: [],
}

afterEach(() => { cleanup(); channels.length = 0; vi.unstubAllGlobals() })

describe('iframe level lifecycle', () => {
  it('leaves legacy one-level iframe lifecycle unchanged', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel)
    const legacy = { ...game, levelCount: undefined }
    const view = render(<IframeGame game={legacy} paused={false} muted={false} level={1} onEvent={vi.fn()} />)
    const iframe = view.getByTitle('Orbit') as HTMLIFrameElement
    fireEvent.load(iframe)
    const channel = new URL(iframe.src).hash.split('oa-channel=')[1]
    const port = channels[0].port1
    act(() => port.onmessage?.({ data: {
      protocol: 'openarcade:v1', source: 'game', channel, event: { type: 'ready' },
    } } as MessageEvent))
    await waitFor(() => expect(port.messages.some((value) => JSON.stringify(value).includes('resume'))).toBe(true))
    expect(port.messages.some((value) => JSON.stringify(value).includes('load-level'))).toBe(false)
  })

  it('loads a level once after ready and never reloads it for pause or mute', async () => {
    vi.stubGlobal('MessageChannel', FakeMessageChannel)
    const onEvent = vi.fn()
    const view = render(<IframeGame game={game} paused={false} muted={false} level={7} onEvent={onEvent} />)
    const iframe = view.getByTitle('Orbit') as HTMLIFrameElement
    fireEvent.load(iframe)
    const channel = new URL(iframe.src).hash.split('oa-channel=')[1]
    const port = channels[0].port1
    act(() => port.onmessage?.({ data: {
      protocol: 'openarcade:v1', source: 'game', channel, event: { type: 'ready' },
    } } as MessageEvent))

    await waitFor(() => expect(port.messages.some((value) => JSON.stringify(value).includes('load-level'))).toBe(true))
    view.rerender(<IframeGame game={game} paused muted level={7} onEvent={onEvent} />)
    await waitFor(() => expect(port.messages.some((value) => JSON.stringify(value).includes('pause'))).toBe(true))
    expect(port.messages.filter((value) => JSON.stringify(value).includes('load-level'))).toHaveLength(1)
  })
})
