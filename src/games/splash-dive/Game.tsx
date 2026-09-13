import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import {
  DIVER_PY, FIELD, PPM, SCORE_CAP, comboMultiplier, currentAt, step,
  type GameState, type InputState, type StepEvent,
} from './logic'
import { createDiveState, getDiveLevel, LEVEL_COUNT } from './levels'
import './splash-dive.css'

interface Hud {
  score: number
  lives: number
  depth: number
  quota: number
  pearls: number
  chain: number
  current: number
  diving: boolean
  status: GameState['status']
  final: number
}

interface RunProps { level: number; paused: boolean; emit: (event: GameEvent) => void; audio: GameAudio; onRestart: () => void }

const readHud = (state: GameState, diving: boolean): Hud => ({
  score: Math.min(SCORE_CAP, state.score),
  lives: state.lives,
  depth: Math.floor(state.depth),
  quota: state.quota,
  pearls: state.pearlsGot,
  chain: state.chain,
  current: Math.round(currentAt(state.zones, state.depth)),
  diving,
  status: state.status,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) =>
  a.score === b.score && a.lives === b.lives && a.depth === b.depth && a.pearls === b.pearls && a.chain === b.chain &&
  a.current === b.current && a.diving === b.diving && a.status === b.status

export default function SplashDiveGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <DiveRun key={`${levelNumber}-${epoch}`} level={levelNumber} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
  )
}

function DiveRun({ level, paused, emit, audio, onRestart }: RunProps) {
  const spec = useMemo(() => getDiveLevel(level), [level])
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef(createDiveState(level))
  const [hud, setHud] = useState<Hud>(() => readHud(createDiveState(level), false))
  const hudRef = useRef(hud)
  const doneRef = useRef(false)
  const inputRef = useRef<InputState>({ left: false, right: false, down: false })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const diverRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const hazardLayerRef = useRef<HTMLDivElement | null>(null)
  const pearlLayerRef = useRef<HTMLDivElement | null>(null)
  const hazardEls = useRef(new Map<number, HTMLDivElement>())
  const pearlEls = useRef(new Map<number, HTMLDivElement>())
  const reduceMotion = useMemo(() => prefersReducedMotion(), [])

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
    const paint = (state: GameState) => {
      const diver = diverRef.current
      if (diver) {
        diver.style.transform = `translate(${state.x - 16}px, ${DIVER_PY - 20}px)`
        diver.classList.toggle('is-invuln', state.invuln > 0 && !reduceMotion)
      }
      const progress = progressRef.current
      if (progress) progress.style.transform = `scaleX(${Math.min(1, state.depth / state.quota)})`
      const layer = hazardLayerRef.current
      if (layer) {
        const alive = new Set<number>()
        for (const hazard of state.hazards) {
          alive.add(hazard.id)
          let el = hazardEls.current.get(hazard.id)
          if (!el) {
            el = document.createElement('div')
            el.className = `sd-hazard is-${hazard.kind}`
            const size = hazard.r * 2
            el.style.width = `${size}px`
            el.style.height = `${size}px`
            layer.appendChild(el)
            hazardEls.current.set(hazard.id, el)
          }
          el.style.transform = `translate(${hazard.x - hazard.r}px, ${DIVER_PY + hazard.y * PPM - hazard.r}px)`
        }
        for (const [id, el] of hazardEls.current) {
          if (!alive.has(id)) {
            el.remove()
            hazardEls.current.delete(id)
          }
        }
      }
      const pearls = pearlLayerRef.current
      if (pearls) {
        const alive = new Set<number>()
        for (const pearl of state.pearls) {
          alive.add(pearl.id)
          let el = pearlEls.current.get(pearl.id)
          if (!el) {
            el = document.createElement('div')
            el.className = 'sd-pearl'
            pearls.appendChild(el)
            pearlEls.current.set(pearl.id, el)
          }
          el.style.transform = `translate(${pearl.x - 8}px, ${DIVER_PY + pearl.y * PPM - 8}px)`
        }
        for (const [id, el] of pearlEls.current) {
          if (!alive.has(id)) {
            el.remove()
            pearlEls.current.delete(id)
          }
        }
      }
    }
    const playCue = (event: StepEvent, wasDiving: boolean, diving: boolean) => {
      if (event === 'pearl') audio.play('match')
      else if (event === 'hit') audio.play('mismatch')
      else if (event === 'current') audio.play('step')
      else if (!wasDiving && diving) audio.play('select')
    }
    const finish = (state: GameState) => {
      if (doneRef.current) return
      doneRef.current = true
      const total = Math.min(SCORE_CAP, state.score)
      setHud({ ...readHud(state, false), final: total })
      if (state.status === 'cleared') {
        audio.play('win')
        emit({ type: 'completed', score: total })
      } else {
        audio.play('lose')
        emit({ type: 'failed', score: total })
      }
    }
    let raf = 0
    let last = performance.now()
    let lastEmit = 0
    let shownScore = -1
    let wasDiving = false
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const next = step(stateRef.current, inputRef.current, dt)
      stateRef.current = next
      const diving = inputRef.current.down
      paint(next)
      for (const event of next.events) playCue(event, wasDiving, diving)
      wasDiving = diving
      if (next.status !== 'playing') {
        finish(next)
        return
      }
      if (next.score !== shownScore && now - lastEmit > 64) {
        shownScore = next.score
        lastEmit = now
        emit({ type: 'score', score: next.score })
      }
      const snapshot = readHud(next, diving)
      if (!sameHud(snapshot, hudRef.current)) {
        hudRef.current = snapshot
        setHud(snapshot)
      }
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, emit, paused, reduceMotion])

  useEffect(() => {
    const keyOf = (event: KeyboardEvent): 'left' | 'right' | 'down' | null => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') return 'left'
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') return 'right'
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') return 'down'
      return null
    }
    const down = (event: KeyboardEvent) => {
      const key = keyOf(event)
      if (!key || pausedRef.current) return
      event.preventDefault()
      inputRef.current[key] = true
    }
    const up = (event: KeyboardEvent) => {
      const key = keyOf(event)
      if (key) inputRef.current[key] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const hold = (key: 'left' | 'right' | 'down', down: boolean) => {
    if (pausedRef.current) return
    inputRef.current[key] = down
  }

  return (
    <div className={`sd-game chapter-${spec.chapter} ${reduceMotion ? 'reduce-motion' : ''} is-${hud.status}`} aria-label="深潜奇航游戏区">
      <div className="sd-readout">
        <span>关卡 {String(level).padStart(2, '0')} · {spec.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="sd-rule">
        <span>{spec.detail}</span>
        {hud.current !== 0 && <em className={hud.current < 0 ? 'is-flow-left' : 'is-flow-right'}>{hud.current < 0 ? '← 洋流' : '洋流 →'}{Math.abs(hud.current)}</em>}
        {spec.combo && hud.chain > 0 && <em className="is-combo">连收 ×{comboMultiplier(hud.chain)}</em>}
        <em className="is-pearl">珍珠 ×{hud.pearls}</em>
        <em className="is-depth">{hud.depth}/{hud.quota}m</em>
        <em className="is-life">{'◆'.repeat(Math.max(0, hud.lives))}</em>
      </div>
      <div ref={stageRef} className="sd-stage">
        <div ref={fieldRef} className="sd-scaler">
          <div ref={progressRef} className="sd-progress" />
          <div ref={pearlLayerRef} className="sd-pearls" />
          <div ref={hazardLayerRef} className="sd-hazards" />
          <div ref={diverRef} className="sd-diver" />
        </div>
        {hud.status !== 'playing' && (
          <div className="sd-stamp">
            <span>{hud.status === 'cleared' ? '深潜达标' : '触雷沉没'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="sd-actions">
        <div className="sd-pad">
          <button type="button" className="sd-pad-button" aria-label="向左游动" disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('left', true)} onPointerUp={() => hold('left', false)}
            onPointerLeave={() => hold('left', false)} onPointerCancel={() => hold('left', false)}
          ><ChevronLeft size={20} /></button>
          <button type="button" className="sd-pad-button" aria-label="向右游动" disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('right', true)} onPointerUp={() => hold('right', false)}
            onPointerLeave={() => hold('right', false)} onPointerCancel={() => hold('right', false)}
          ><ChevronRight size={20} /></button>
        </div>
        <button
          type="button" className={`sd-dive ${hud.diving ? 'is-on' : ''}`} aria-label="加速下潜"
          disabled={hud.status !== 'playing'}
          onPointerDown={() => hold('down', true)} onPointerUp={() => hold('down', false)}
          onPointerLeave={() => hold('down', false)} onPointerCancel={() => hold('down', false)}
        ><ChevronDown size={20} />下潜</button>
        <button type="button" className="sd-restart" onClick={onRestart}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
