import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

interface BrowserSdk {
  ready: () => void
  started: () => void
  destroy: () => void
}

declare global {
  var OpenArcade: { createSdk: () => BrowserSdk } | undefined
}

afterEach(() => {
  delete globalThis.OpenArcade
  history.replaceState(null, '', '/')
})

describe('browser SDK conformance', () => {
  it('queues lifecycle events until a private port is transferred', () => {
    const channel = '0123456789abcdef'
    history.replaceState(null, '', `/#oa-channel=${channel}`)
    const source = readFileSync('public/sdk/openarcade-v1.js', 'utf8')
    window.eval(source)

    const sdk = globalThis.OpenArcade!.createSdk()
    sdk.ready()
    sdk.started()

    const events: unknown[] = []
    const port = {
      postMessage: (event: unknown) => events.push(event),
      start: () => undefined,
      close: () => undefined,
      onmessage: null,
    }
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { protocol: 'openarcade:v1', source: 'host', channel, type: 'connect' },
      ports: [port as unknown as MessagePort],
    }))

    expect(events).toHaveLength(2)
    expect(events).toEqual([
      { protocol: 'openarcade:v1', source: 'game', channel, event: { type: 'ready' } },
      { protocol: 'openarcade:v1', source: 'game', channel, event: { type: 'started' } },
    ])
    sdk.destroy()
  })
})
