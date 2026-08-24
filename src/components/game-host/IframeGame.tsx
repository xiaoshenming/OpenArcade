import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, HostCommand, IframeManifest } from '../../sdk'
import { PROTOCOL } from '../../sdk/contracts'
import { createChannel, createGameUrl, getIframePolicy } from '../../platform/iframe-policy'
import { hostMessage, parseGameMessage } from '../../platform/protocol'
import { ErrorState, LoadingState } from './HostState'

const READY_TIMEOUT_MS = 10_000

interface Props {
  game: IframeManifest
  paused: boolean
  muted: boolean
  onEvent: (event: GameEvent) => void
}

export function IframeGame({ game, paused, muted, onEvent }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const portRef = useRef<MessagePort | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const [channel, setChannel] = useState(createChannel)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const src = useMemo(() => createGameUrl(game.entry, channel), [channel, game.entry])
  const policy = useMemo(() => getIframePolicy(game), [game])

  const send = useCallback((command: HostCommand) => {
    portRef.current?.postMessage(hostMessage(command, channel))
  }, [channel])

  const connect = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow
    if (!frameWindow) return
    portRef.current?.close()
    const connection = new MessageChannel()
    portRef.current = connection.port1
    connection.port1.onmessage = (message) => {
      const event = parseGameMessage(message.data, channel)
      if (!event) return
      if (event.type === 'ready') {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
        setStatus('ready')
      }
      onEvent(event)
    }
    connection.port1.start()
    frameWindow.postMessage({ protocol: PROTOCOL, source: 'host', channel, type: 'connect' }, policy.targetOrigin, [connection.port2])
  }, [channel, onEvent, policy.targetOrigin])

  useEffect(() => {
    timeoutRef.current = window.setTimeout(() => setStatus('error'), READY_TIMEOUT_MS)
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      portRef.current?.close()
      portRef.current = null
    }
  }, [channel])

  useEffect(() => {
    if (status !== 'ready') return
    send({ type: paused ? 'pause' : 'resume' })
    send({ type: 'mute', muted })
  }, [muted, paused, send, status])

  const retry = () => {
    setStatus('loading')
    setChannel(createChannel())
  }

  return (
    <div className="iframe-container">
      <iframe ref={frameRef} className="game-frame" src={src} title={game.title} sandbox={policy.sandbox} allow={policy.allow} onLoad={connect} />
      {status === 'loading' && <div className="host-overlay"><LoadingState label="建立安全通道…" /></div>}
      {status === 'error' && <div className="host-overlay"><ErrorState message="游戏未在 10 秒内就绪。" onRetry={retry} /></div>}
    </div>
  )
}
