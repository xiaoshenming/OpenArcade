import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import { FIELD, SCORE_CAP, SHIP_RADIUS, SHIP_Y, applyInput, createGameState, step, type GameState, type StepEvent } from './logic'
import { getCorridorLevel, LEVEL_COUNT, type CorridorLevel } from './levels'
import './meteor-corridor.css'

interface Hud { score: number; shield: number; seconds: number; grazes: number; status: GameState['status']; final: number }

interface RunProps { plan: CorridorLevel; paused: boolean; emit: (event: GameEvent) => void; audio: GameAudio; onRestart: () => void }

const readHud = (state: GameState): Hud => ({
  score: Math.min(SCORE_CAP, Math.floor(state.score)),
  shield: state.shield,
  seconds: Math.max(0, Math.ceil(state.duration - state.time)),
  grazes: state.grazes,
  status: state.status,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) => a.score === b.score && a.shield === b.shield && a.seconds === b.seconds && a.grazes === b.grazes && a.status === b.status

export default function MeteorCorridorGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const plan = useMemo(() => getCorridorLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <CorridorRun key={`${levelNumber}-${epoch}`} plan={plan} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
  )
}

function CorridorRun({ plan, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef(createGameState(plan))
  const [hud, setHud] = useState<Hud>(() => readHud(createGameState(plan)))
  const hudRef = useRef(hud)
  const doneRef = useRef(false)
  const inputRef = useRef({ left: false, right: false, pointerX: null as number | null })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const shipRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const meteorLayerRef = useRef<HTMLDivElement | null>(null)
  const meteorEls = useRef(new Map<number, HTMLDivElement>())
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
      const shipEl = shipRef.current
      if (shipEl) {
        shipEl.style.transform = `translate(${state.ship - SHIP_RADIUS}px, ${SHIP_Y - SHIP_RADIUS}px)`
        shipEl.classList.toggle('is-invuln', state.invuln > 0 && !reduceMotion)
      }
      const progress = progressRef.current
      if (progress) progress.style.transform = `scaleX(${Math.min(1, state.time / state.duration)})`
      const layer = meteorLayerRef.current
      if (!layer) return
      const alive = new Set<number>()
      for (const meteor of state.meteors) {
        alive.add(meteor.id)
        let el = meteorEls.current.get(meteor.id)
        if (!el) {
          el = document.createElement('div')
          el.className = `mc-meteor is-${meteor.kind}`
          el.style.width = `${meteor.r * 2}px`
          el.style.height = `${meteor.r * 2}px`
          layer.appendChild(el)
          meteorEls.current.set(meteor.id, el)
        }
        el.style.transform = `translate(${meteor.x - meteor.r}px, ${meteor.y - meteor.r}px)`
      }
      for (const [id, el] of meteorEls.current) {
        if (!alive.has(id)) {
          el.remove()
          meteorEls.current.delete(id)
        }
      }
    }
    const playCue = (event: StepEvent) => {
      if (event === 'hit') audio.play('mismatch')
      else if (event === 'graze') audio.play('step')
      else if (event === 'split') audio.play('select')
    }
    const finish = (state: GameState) => {
      if (doneRef.current) return
      doneRef.current = true
      const total = Math.min(SCORE_CAP, Math.floor(state.score))
      setHud({ ...readHud(state), final: total })
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
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const current = applyInput(stateRef.current, inputRef.current, dt)
      const next = step(current, dt)
      stateRef.current = next
      paint(next)
      for (const event of next.events) playCue(event)
      if (next.status !== 'playing') {
        finish(next)
        return
      }
      const shown = Math.min(SCORE_CAP, Math.floor(next.score))
      if (shown !== shownScore && now - lastEmit > 64) {
        shownScore = shown
        lastEmit = now
        emit({ type: 'score', score: shown })
      }
      const snapshot = readHud(next)
      if (!sameHud(snapshot, hudRef.current)) {
        hudRef.current = snapshot
        setHud(snapshot)
      }
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, emit, plan, paused, reduceMotion])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      // While paused the host owns the arrows: do not intercept and do not latch input.
      if (pausedRef.current) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') inputRef.current.left = true
      else inputRef.current.right = true
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

  const movePointer = (clientX: number) => {
    const stage = stageRef.current
    if (!stage || pausedRef.current) return
    const rect = stage.getBoundingClientRect()
    inputRef.current.pointerX = ((clientX - rect.left) / rect.width) * FIELD.width
  }
  // Releasing the stage must clear the touch point, otherwise the ship stays pinned
  // to a stale coordinate and keyboard input stops steering.
  const releasePointer = () => {
    inputRef.current.pointerX = null
  }
  const hold = (side: 'left' | 'right', down: boolean) => {
    if (side === 'left') inputRef.current.left = down
    else inputRef.current.right = down
  }

  return (
    <div className={`mc-game chapter-${plan.chapter} ${reduceMotion ? 'reduce-motion' : ''} is-${hud.status}`} aria-label="陨石回廊游戏区">
      <div className="mc-readout">
        <span>关卡 {String(plan.level).padStart(2, '0')} · {plan.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="mc-rule">
        <span>{plan.detail}</span>
        {plan.graze && <em className="is-graze">擦弹 ×{hud.grazes}</em>}
        <em className="is-time">{hud.seconds}s</em>
        <em className="is-shield">{'◆'.repeat(Math.max(0, hud.shield))}</em>
      </div>
      <div
        ref={stageRef}
        className="mc-stage"
        onPointerDown={(event) => movePointer(event.clientX)}
        onPointerMove={(event) => movePointer(event.clientX)}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={releasePointer}
      >
        <div ref={fieldRef} className="mc-scaler">
          <div ref={progressRef} className="mc-progress" />
          <div ref={meteorLayerRef} className="mc-meteors" />
          <div
            ref={shipRef}
            className="mc-ship"
            style={{ width: SHIP_RADIUS * 2, height: SHIP_RADIUS * 2, transform: `translate(${FIELD.width / 2 - SHIP_RADIUS}px, ${SHIP_Y - SHIP_RADIUS}px)` }}
          />
        </div>
        {hud.status !== 'playing' && (
          <div className="mc-stamp">
            <span>{hud.status === 'cleared' ? '回廊穿越' : '护盾击穿'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="mc-actions">
        <div className="mc-pad">
          <button
            type="button"
            className="mc-pad-button"
            aria-label="飞船左移"
            disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('left', true)}
            onPointerUp={() => hold('left', false)}
            onPointerLeave={() => hold('left', false)}
            onPointerCancel={() => hold('left', false)}
          ><ChevronLeft size={20} /></button>
          <button
            type="button"
            className="mc-pad-button"
            aria-label="飞船右移"
            disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('right', true)}
            onPointerUp={() => hold('right', false)}
            onPointerLeave={() => hold('right', false)}
            onPointerCancel={() => hold('right', false)}
          ><ChevronRight size={20} /></button>
        </div>
        <button type="button" className="mc-restart" onClick={onRestart}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
