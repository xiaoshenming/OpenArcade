import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Wind } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { createGates, createWind, getCloudLevel, LEVEL_COUNT, type GateSpec, type HopLevel, type WindSpec } from './levels'
import { COIN_RADIUS, FLAP_VY, GATE_WIDTH, WORLD, createWorld, gateCenter, step, windForce, windWarning, type GateLive, type WorldState } from './logic'
import './cloud-hop.css'

interface HopView {
  scroll: number
  bird: { x: number; y: number; vy: number }
  centers: number[]
  live: GateLive[]
  passed: number
  score: number
  coins: number
  status: WorldState['status']
  gust: number
  warn: boolean
}

const ratio = (value: number, total: number) => `${(value / total) * 100}%`

function snapshot(world: WorldState, spec: HopLevel, gates: readonly GateSpec[], wind: WindSpec | undefined): HopView {
  return {
    scroll: world.scroll,
    bird: { ...world.bird },
    centers: gates.map((gate) => gateCenter(gate, world.time, spec.gap)),
    live: world.gates.map((gate) => ({ ...gate })),
    passed: world.passed,
    score: world.score,
    coins: world.coins,
    status: world.status,
    gust: wind ? windForce(wind, world.time) : 0,
    warn: wind ? windWarning(wind, world.time) : false,
  }
}

export default function CloudHopGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getCloudLevel(levelNumber), [levelNumber])
  const gates = useMemo(() => createGates(levelNumber), [levelNumber])
  const wind = useMemo(() => createWind(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [boot] = useState(() => createWorld(gates))
  const worldRef = useRef<WorldState>(boot)
  const [view, setView] = useState(() => snapshot(boot, spec, gates, wind))
  const pausedRef = useRef(paused)
  const emitRef = useRef(emit)

  useEffect(() => {
    emitRef.current = emit
  }, [emit])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    worldRef.current = createWorld(gates)
    setView(snapshot(worldRef.current, spec, gates, wind))
  }, [spec, gates, wind])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  const restart = () => {
    if (pausedRef.current) return
    emitRef.current({ type: 'request-restart' })
  }

  const tap = () => {
    if (pausedRef.current) return
    if (worldRef.current.status !== 'flying') {
      restart()
      return
    }
    worldRef.current = { ...worldRef.current, bird: { ...worldRef.current.bird, vy: FLAP_VY } }
    audio.play('select')
  }

  const tapRef = useRef(tap)
  useEffect(() => {
    tapRef.current = tap
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault()
        tapRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      const world = worldRef.current
      if (pausedRef.current || world.status !== 'flying' || delta <= 0) return
      const next = step(world, spec, gates, wind, delta, false)
      worldRef.current = next
      if (next.score !== world.score) {
        emitRef.current({ type: 'score', score: next.score })
        audio.play(next.coins !== world.coins ? 'match' : 'step')
      }
      if (next.status === 'completed') {
        audio.play('win')
        emitRef.current({ type: 'completed', score: next.score })
      } else if (next.status === 'failed') {
        audio.play('lose')
        emitRef.current({ type: 'failed', score: next.score })
      }
      setView(snapshot(next, spec, gates, wind))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audio, gates, spec, wind])

  const gusting = view.gust !== 0
  const windArrow = view.gust > 0 ? '→' : '←'
  const tilt = Math.max(-24, Math.min(64, view.bird.vy * 1.7))
  return (
    <div className={`hop-game mode-${spec.mode}${view.warn ? ' is-warn' : ''}${gusting ? ' is-gusty' : ''}${paused ? ' is-paused' : ''}`} aria-label="羽翼穿云游戏区">
      <div className="hop-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.title}</span>
        <strong>{String(view.score).padStart(4, '0')} 分</strong>
      </div>
      <div className="hop-rule">
        <span><Wind size={14} />{spec.detail}</span>
        <small>门 {view.passed}/{spec.quota}{spec.coin ? ` · 金环 ${view.coins}` : ''}</small>
        {spec.wind && (view.warn || gusting) && <em>{gusting ? `罡风 ${windArrow}` : '风阵将至'}</em>}
      </div>
      <div className="hop-stage" onPointerDown={(event) => { event.preventDefault(); tap() }} aria-label="点击画面或按空格键拍动羽翼">
        <div className="hop-clouds hop-clouds-far" />
        <div className="hop-clouds hop-clouds-near" />
        {gates.map((gate, index) => {
          const left = gate.x - view.scroll
          const center = view.centers[index]
          const state = view.live[index]
          return (
            <div key={gate.index} className={`hop-gate${state.passed ? ' is-passed' : ''}`} style={{ left: ratio(left, WORLD.width), width: ratio(GATE_WIDTH, WORLD.width) }}>
              <div className="hop-pipe" style={{ height: ratio(center - spec.gap / 2, WORLD.height) }} />
              <div className="hop-gap" style={{ height: ratio(spec.gap, WORLD.height) }}>
                {gate.coin && <span className={`hop-ring${state.coinTaken ? ' is-taken' : ''}`} style={{ height: ratio(COIN_RADIUS * 2, WORLD.height) }} />}
              </div>
              <div className="hop-pipe" style={{ height: ratio(WORLD.height - center - spec.gap / 2, WORLD.height) }} />
            </div>
          )
        })}
        <div
          className={`hop-bird${view.status === 'failed' ? ' is-crash' : ''}`}
          style={{ left: ratio(view.bird.x, WORLD.width), top: ratio(view.bird.y, WORLD.height), transform: `translate(-50%, -50%) rotate(${tilt}deg)` }}
        />
        <div className="hop-ground" />
        {view.status !== 'flying' && (
          <div className={`hop-stamp ${view.status === 'completed' ? 'is-win' : 'is-lose'}`}>
            <span>{view.status === 'completed' ? '穿云告捷' : '坠入云海'}</span>
            <strong>{view.score} 分</strong>
            <small>{view.passed}/{spec.quota} 门 · {view.coins} 金环 · 点击画面再来一次</small>
          </div>
        )}
      </div>
      <button className="hop-restart" onClick={restart} disabled={paused}><RotateCcw size={16} />重开本关</button>
    </div>
  )
}
