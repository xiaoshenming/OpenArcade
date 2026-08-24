(() => {
  const PROTOCOL = 'openarcade:v1'
  const channel = new URLSearchParams(location.hash.slice(1)).get('oa-channel')
  if (!channel) throw new Error('OpenArcade channel is missing')

  function createSdk({ onCommand = () => {} } = {}) {
    let port
    const queue = []
    const send = (payload) => port ? port.postMessage(payload) : queue.push(payload)
    const emit = (event) => send({ protocol: PROTOCOL, source: 'game', channel, event })

    const receiveCommand = (message) => {
      const payload = message.data
      if (payload?.protocol !== PROTOCOL || payload?.source !== 'host' || payload?.channel !== channel) return
      onCommand(payload.command)
    }

    const connect = (message) => {
      const payload = message.data
      if (message.source !== window.parent || payload?.protocol !== PROTOCOL) return
      if (payload?.source !== 'host' || payload?.channel !== channel || payload?.type !== 'connect') return
      const nextPort = message.ports[0]
      if (!nextPort || port) return
      port = nextPort
      port.onmessage = receiveCommand
      port.start()
      queue.splice(0).forEach((item) => port.postMessage(item))
      window.removeEventListener('message', connect)
    }

    window.addEventListener('message', connect)
    return Object.freeze({
      ready: () => emit({ type: 'ready' }),
      started: () => emit({ type: 'started' }),
      score: (score) => emit({ type: 'score', score }),
      complete: (score) => emit({ type: 'completed', score }),
      fail: (score = 0) => emit({ type: 'failed', score }),
      requestRestart: () => emit({ type: 'request-restart' }),
      destroy: () => { window.removeEventListener('message', connect); port?.close() },
    })
  }

  globalThis.OpenArcade = Object.freeze({ createSdk })
})()
