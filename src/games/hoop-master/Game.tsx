import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Target } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { createPegs, getPegLevel, LEVEL_COUNT, type PegLevel, type PegSpec, type WindSpec } from './levels'
import { TABLE, TABLE_Y, THROWER, WORLD, createState, lockThrow, pegX, step, windBias, type HoopState } from './logic'
import './hoop-master.css'

const PPU = 5
const FIELD_W = WORLD.width * PPU

interface PegView {
  index: number
  x: number
  baseX: number
  amp: number
  gold: boolean
  claimed: boolean
}

interface HoopView {
  time: number
  phase: HoopState['phase']
  power: number
  hoops: { id: number; x: number; y: number }[]
  pegs: PegView[]
  marks: HoopState['marks']
  score: number
  throwsLeft: number
  quota: number
  wind: number
  status: HoopState['status']
}

function snapshot(state: HoopState, spec: PegLevel, pegs: readonly PegSpec[], wind: WindSpec | null): HoopView {
  return {
    time: state.time,
    phase: state.phase,
    power: state.power,
    hoops: state.hoops.map((hoop) => ({ id: hoop.id, x: hoop.x, y: hoop.y })),
    pegs: pegs.map((peg) => ({
      index: peg.index,
      x: pegX(peg, state.time),
      baseX: peg.baseX,
      amp: peg.amp,
      gold: peg.kind === 'gold',
      claimed: state.claimed[peg.index],
    })),
    marks: state.marks,
    score: state.score,
    throwsLeft: state.throwsLeft,
    quota: spec.quota,
    wind: windBias(wind ?? undefined, state.time),
    status: state.status,
  }
}

interface RunProps {
  spec: PegLevel
  pegs: PegSpec[]
  wind: WindSpec | null
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function HoopMasterGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const spec = useMemo(() => getPegLevel(levelNumber), [levelNumber])
  const pegs = useMemo(() => createPegs(levelNumber), [levelNumber])
  const wind = spec.wind
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <HoopRun
      key={`${levelNumber}-${epoch}`}
      spec={spec}
      pegs={pegs}
      wind={wind}
      paused={paused}
      emit={emit}
      audio={audio}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function HoopRun({ spec, pegs, wind, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  const stateRef = useRef(createState(spec, pegs))
  const [view, setView] = useState(() => snapshot(createState(spec, pegs), spec, pegs, wind))
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [hint, setHint] = useState('')
  const hintTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(hintTimer.current), [])

  const rejectThrow = () => {
    // 锁圈被拒(圈还在空中):给 mismatch 音效和文字提示,不让点击无声无息
    audio.play('mismatch')
    setHint('圈还在飞行中,等它落台后再锁定')
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(''), 900)
  }

  const throwHoop = () => {
    if (pausedRef.current) return
    const before = stateRef.current
    if (before.status !== 'play') {
      onRestart()
      return
    }
    const after = lockThrow(before, spec, wind ?? undefined)
    if (after === before) {
      rejectThrow()
      return
    }
    stateRef.current = after
    audio.play('select')
  }
  const throwRef = useRef(throwHoop)
  useEffect(() => {
    throwRef.current = throwHoop
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        throwRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const field = fieldRef.current
    if (!stage || !field) return
    const fit = () => {
      field.style.transform = `scale(${stage.clientWidth / FIELD_W})`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const delta = Math.min(0.05, (now - last) / 1000)
      last = now
      const world = stateRef.current
      if (pausedRef.current || world.status !== 'play' || delta <= 0) return
      const next = step(world, spec, pegs, delta)
      stateRef.current = next
      for (const event of next.events) {
        if (event === 'lock') audio.play('select')
        else if (event === 'ring' || event === 'gold') audio.play('match')
        else if (event === 'miss') audio.play('mismatch')
      }
      if (next.score !== world.score) emit({ type: 'score', score: next.score })
      if (next.status !== 'play' && !doneRef.current) {
        doneRef.current = true
        if (next.status === 'completed') {
          audio.play('win')
          emit({ type: 'completed', score: next.score })
        } else {
          audio.play('lose')
          emit({ type: 'failed', score: next.score })
        }
      }
      setView(snapshot(next, spec, pegs, wind))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audio, emit, pegs, spec, wind])

  return (
    <div className={`hm-game mode-${spec.mode} is-${view.status}${paused ? ' is-paused' : ''}`} aria-label="套圈大师游戏区">
      <div className="hm-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {spec.title}</span>
        <strong>{view.score} 分</strong>
      </div>
      <div className="hm-rule">
        <span>{spec.detail}</span>
        <small>{view.score}/{spec.quota} 分 · 圈 ×{view.throwsLeft}{spec.double ? ' · 双圈' : ''}</small>
        {spec.wind && <em className={`hm-wind${view.wind !== 0 ? ' is-blowing' : ''}`}>风 {view.wind >= 0 ? '→' : '←'}{Math.abs(view.wind).toFixed(2)}</em>}
        <em className="hm-bar"><i style={{ width: `${Math.min(100, (view.score / spec.quota) * 100)}%` }} /></em>
      </div>
      <div
        ref={stageRef}
        className="hm-stage"
        onPointerDown={(event) => {
          event.preventDefault()
          throwHoop()
        }}
        aria-label="点击画面或按空格键锁定力度投出套圈"
      >
        <div ref={fieldRef} className="hm-field">
          <div className="hm-table" style={{ left: TABLE.left * PPU, top: TABLE_Y * PPU, width: (TABLE.right - TABLE.left) * PPU, height: (WORLD.height - TABLE_Y) * PPU }} />
          {view.pegs.map((peg) => (
            <div key={peg.index}>
              {peg.amp > 0 && <i className="hm-rail" style={{ left: (peg.baseX - peg.amp) * PPU, top: TABLE_Y * PPU - 6, width: peg.amp * 2 * PPU }} />}
              <b
                className={`hm-peg${peg.gold ? ' is-gold' : ''}${peg.claimed ? ' is-claimed' : ''}`}
                style={{ left: peg.x * PPU, top: TABLE_Y * PPU }}
              />
            </div>
          ))}
          {view.marks.map((mark, index) => (
            <i key={index} className={`hm-mark${mark.hit ? ' is-hit' : ''}`} style={{ left: mark.x * PPU, top: (TABLE_Y - 4) * PPU }} />
          ))}
          {view.hoops.map((hoop) => (
            <b key={hoop.id} className="hm-hoop" style={{ left: hoop.x * PPU, top: hoop.y * PPU }} />
          ))}
          <b className={`hm-thrower${view.phase === 'aim' ? ' is-aiming' : ''}`} style={{ left: THROWER.x * PPU, top: THROWER.y * PPU }} />
        </div>
        <div className={`hm-meter${view.phase === 'flight' ? ' is-locked' : ''}`} aria-label="力度条">
          <i style={{ height: `${view.power * 100}%` }} />
        </div>
        {view.status !== 'play' && (
          <div className={`hm-stamp ${view.status === 'completed' ? 'is-win' : 'is-lose'}`}>
            <span>{view.status === 'completed' ? '满贯达成' : '套圈告罄'}</span>
            <strong>{view.score} 分</strong>
            <small>{view.score}/{spec.quota} 分 · 点击画面再来一次</small>
          </div>
        )}
      </div>
      <div className="hm-actions">
        <span>{hint || '力度条摆到合适位置时点击画面锁定投圈 · 空格键同样有效'}</span>
        <button type="button" className="hm-throw" onClick={() => { if (!paused) throwHoop() }} disabled={paused || view.status !== 'play' || view.phase !== 'aim'}>
          <Target size={15} />投圈
        </button>
        <button type="button" onClick={() => { if (!paused) onRestart() }} disabled={paused}>
          <RotateCcw size={15} />重开本关
        </button>
      </div>
    </div>
  )
}
