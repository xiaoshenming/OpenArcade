import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { FIELD, PADDLE_BASE, PADDLE_SPEED, PADDLE_TOP, SCORE_CAP, createGameState, step, withPaddle, type GameState, type StepEvent } from './logic'
import { LEVEL_COUNT, getJuggleLevel } from './levels'
import './juggle-keep.css'

interface RunProps {
  level: number
  paused: boolean
  muted: boolean
  emit: (event: GameEvent) => void
  onRestart: () => void
}

export default function JuggleKeepGame(props: GameModuleProps) {
  const requested = Number(props.level)
  const level = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)))
  const [epoch, setEpoch] = useState(0)
  return (
    <JuggleRun
      key={`${level}-${epoch}`}
      level={level}
      paused={props.paused}
      muted={props.muted}
      emit={props.emit}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function JuggleRun({ level, paused, muted, emit, onRestart }: RunProps) {
  const plan = useMemo(() => getJuggleLevel(level), [level])
  const audio = useMemo(() => createGameAudio(), [])
  const initial = useMemo(() => createGameState(plan, level), [plan, level])
  const stateRef = useRef<GameState>(initial)
  const [view, setView] = useState<GameState>(initial)
  const inputRef = useRef({ left: false, right: false, pointerX: null as number | null })
  const pausedRef = useRef(paused)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const doneRef = useRef(false)
  const emitRef = useRef({ score: -1, at: 0 })

  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    const stage = stageRef.current
    const field = fieldRef.current
    if (!stage || !field) return
    const fit = () => { field.style.transform = `scale(${stage.clientWidth / FIELD.width})` }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused) return
    const cueOf = (event: StepEvent) => {
      if (event === 'bounce') audio.play('step')
      else if (event === 'gold' || event === 'join' || event === 'serve') audio.play('select')
      else if (event === 'drop') audio.play('mismatch')
    }
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const input = inputRef.current
      let current = stateRef.current
      if (input.pointerX != null) current = withPaddle(current, input.pointerX)
      if (input.left !== input.right) current = withPaddle(current, current.paddle.x + (input.left ? -1 : 1) * PADDLE_SPEED * dt)
      current = step(current, dt)
      stateRef.current = current
      setView(current)
      for (const event of current.events) cueOf(event)
      if (current.score !== emitRef.current.score && now - emitRef.current.at > 64) {
        emitRef.current = { score: current.score, at: now }
        emit({ type: 'score', score: Math.min(SCORE_CAP, current.score) })
      }
      if (current.status !== 'playing') {
        if (doneRef.current) return
        doneRef.current = true
        const total = Math.min(SCORE_CAP, current.score)
        if (current.status === 'cleared') {
          audio.play('win')
          emit({ type: 'completed', score: total })
        } else {
          audio.play('lose')
          emit({ type: 'failed', score: total })
        }
        return
      }
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, emit, paused])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (pausedRef.current) return
      if (event.key === 'ArrowLeft') {
        inputRef.current.left = true
        event.preventDefault()
      } else if (event.key === 'ArrowRight') {
        inputRef.current.right = true
        event.preventDefault()
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') inputRef.current.left = false
      if (event.key === 'ArrowRight') inputRef.current.right = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage || paused) return
    const rect = stage.getBoundingClientRect()
    inputRef.current.pointerX = ((event.clientX - rect.left) / rect.width) * FIELD.width
  }

  const hold = (side: 'left' | 'right', down: boolean) => {
    if (side === 'left') inputRef.current.left = down
    else inputRef.current.right = down
  }

  const state = view
  const ended = state.status !== 'playing'
  const progress = Math.min(1, state.bounces / state.quota)
  return (
    <div className={`jk-game chapter-${plan.chapter} ${paused ? 'is-paused' : ''} is-${state.status}`} aria-label="空中续球游戏区">
      <div className="jk-readout">
        <span>关卡 {String(level).padStart(2, '0')} · 第{plan.chapter}章 {plan.title}</span>
        <strong>{state.score} 分 · {state.bounces}/{state.quota} 跳 · {'♥'.repeat(Math.max(0, state.lives))}</strong>
      </div>
      <div className="jk-rule">
        <span>{plan.detail}</span>
        {plan.goldCount > 0 && <em className="jk-gilt">金球×5跳</em>}
        {plan.joinAfter > 0 && <em>接力 {plan.joinAfter.toFixed(1)}s</em>}
        {plan.zones.length > 0 && <em className="jk-zone-chip">重力带</em>}
      </div>
      <div
        ref={stageRef}
        className="jk-stage"
        onPointerDown={movePointer}
        onPointerMove={movePointer}
      >
        <div ref={fieldRef} className="jk-scaler">
          {state.zones.map((zone, index) => (
            <div key={index} className="jk-zone" style={{ top: zone.y, height: zone.height }} />
          ))}
          {state.balls.map((ball) => (
            <span key={ball.id} className={`jk-ball ${ball.kind === 'gold' ? 'is-gold' : ''}`} style={{ width: ball.r * 2, height: ball.r * 2, translate: `${ball.x - ball.r}px ${ball.y - ball.r}px` }} />
          ))}
          <div className="jk-paddle" style={{ width: PADDLE_BASE, translate: `${state.paddle.x - PADDLE_BASE / 2}px ${PADDLE_TOP}px` }} />
          <div className="jk-track"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
        {ended && (
          <div className={`jk-stamp ${state.status === 'cleared' ? 'is-win' : 'is-lose'}`}>
            <span>{state.status === 'cleared' ? '配额达成' : '球落三命'}</span>
            <strong>{Math.min(SCORE_CAP, state.score)} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="jk-actions">
        <div className="jk-pad">
          <button type="button" className="jk-pad-button" aria-label="托板左移" disabled={ended} onPointerDown={() => hold('left', true)} onPointerUp={() => hold('left', false)} onPointerLeave={() => hold('left', false)} onPointerCancel={() => hold('left', false)}><ChevronLeft size={20} /></button>
          <button type="button" className="jk-pad-button" aria-label="托板右移" disabled={ended} onPointerDown={() => hold('right', true)} onPointerUp={() => hold('right', false)} onPointerLeave={() => hold('right', false)} onPointerCancel={() => hold('right', false)}><ChevronRight size={20} /></button>
        </div>
        <button type="button" className="jk-restart" onClick={onRestart} disabled={paused}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
