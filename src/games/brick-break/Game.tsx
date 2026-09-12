import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Rocket, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import {
  FIELD,
  PADDLE_BASE,
  PADDLE_SPEED,
  PADDLE_TOP,
  SCORE_CAP,
  clearBonus,
  createGameState,
  launch,
  paddleSpan,
  step,
  withPaddle,
  type GameState,
  type StepEvent,
} from './logic'
import { getBreakLevel, LEVEL_COUNT, type BreakLevel } from './levels'
import './brick-break.css'

interface Hud { score: number; lives: number; combo: number; status: GameState['status']; wide: boolean; slow: boolean; balls: number; final: number }

interface RunProps {
  levelNumber: number
  plan: BreakLevel
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

const readHud = (state: GameState): Hud => ({
  score: Math.min(SCORE_CAP, state.score),
  lives: state.lives,
  combo: state.combo,
  status: state.status,
  wide: state.effects.wide > 0,
  slow: state.effects.slow > 0,
  balls: state.balls.length,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) => a.score === b.score && a.lives === b.lives && a.combo === b.combo
  && a.status === b.status && a.wide === b.wide && a.slow === b.slow && a.balls === b.balls

export default function BrickBreakGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const plan = useMemo(() => getBreakLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <BreakRun key={`${levelNumber}-${epoch}`} levelNumber={levelNumber} plan={plan} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
  )
}

function BreakRun({ levelNumber, plan, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef(createGameState(plan))
  const brickView = useMemo(() => createGameState(plan).bricks, [plan])
  const [hud, setHud] = useState<Hud>(() => readHud(createGameState(plan)))
  const hudRef = useRef(hud)
  const doneRef = useRef(false)
  const inputRef = useRef({ left: false, right: false, pointerX: null as number | null })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const paddleRef = useRef<HTMLDivElement | null>(null)
  const ballLayerRef = useRef<HTMLDivElement | null>(null)
  const dropLayerRef = useRef<HTMLDivElement | null>(null)
  const brickEls = useRef(new Map<number, HTMLDivElement>())
  const brickCache = useRef(new Map<number, { x: number; hp: number }>())
  const ballEls = useRef<HTMLDivElement[]>([])
  const dropEls = useRef(new Map<number, HTMLDivElement>())
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
      const paddleEl = paddleRef.current
      if (paddleEl) {
        const span = paddleSpan(state)
        paddleEl.style.width = `${span}px`
        paddleEl.style.transform = `translate(${state.paddle.x - span / 2}px, ${PADDLE_TOP}px)`
      }
      const layer = ballLayerRef.current
      if (layer) {
        if (ballEls.current.length !== state.balls.length) {
          layer.textContent = ''
          ballEls.current = state.balls.map(() => {
            const el = document.createElement('div')
            el.className = 'bb-ball'
            layer.appendChild(el)
            return el
          })
        }
        state.balls.forEach((ball, index) => {
          const el = ballEls.current[index]
          if (el) el.style.transform = `translate(${ball.x - ball.r}px, ${ball.y - ball.r}px)`
        })
      }
      const dropLayer = dropLayerRef.current
      if (dropLayer) {
        const alive = new Set(state.drops.map((drop) => drop.id))
        for (const [id, el] of dropEls.current) {
          if (!alive.has(id)) {
            el.remove()
            dropEls.current.delete(id)
          }
        }
        for (const drop of state.drops) {
          let el = dropEls.current.get(drop.id)
          if (!el) {
            el = document.createElement('div')
            el.className = `bb-drop is-${drop.kind}`
            el.textContent = drop.kind === 'wide' ? '宽' : drop.kind === 'slow' ? '缓' : '分'
            dropLayer.appendChild(el)
            dropEls.current.set(drop.id, el)
          }
          el.style.transform = `translate(${drop.x - 10}px, ${drop.y - 7}px)`
        }
      }
      for (const brick of state.bricks) {
        const el = brickEls.current.get(brick.id)
        if (!el) continue
        const cached = brickCache.current.get(brick.id)
        if (cached && cached.x === brick.x && cached.hp === brick.hp) continue
        brickCache.current.set(brick.id, { x: brick.x, hp: brick.hp })
        el.style.transform = `translate(${brick.x}px, ${brick.y}px)`
        if (brick.hp <= 0) el.classList.add('is-gone')
        else if (brick.hp === 1 && brick.kind === 'hard') el.classList.add('is-cracked')
      }
    }
    const playCue = (event: StepEvent) => {
      if (event === 'brick') audio.play('match')
      else if (event === 'crack' || event === 'clank') audio.play('mismatch')
      else if (event === 'paddle') audio.play('step')
      else if (event === 'power' || event === 'serve') audio.play('select')
    }
    const finish = (state: GameState) => {
      if (doneRef.current) return
      doneRef.current = true
      const total = Math.min(SCORE_CAP, state.score + (state.status === 'cleared' ? clearBonus(plan.par, state.time) : 0))
      setHud({ ...readHud(state), score: total, final: total })
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
      const input = inputRef.current
      let current = stateRef.current
      if (input.pointerX != null) current = withPaddle(current, input.pointerX)
      if (input.left !== input.right) current = withPaddle(current, current.paddle.x + (input.left ? -1 : 1) * PADDLE_SPEED * dt)
      const next = step(current, dt)
      stateRef.current = next
      paint(next)
      for (const event of next.events) playCue(event)
      if (next.status !== 'playing') {
        finish(next)
        return
      }
      if (next.score !== shownScore && now - lastEmit > 64) {
        shownScore = next.score
        lastEmit = now
        emit({ type: 'score', score: Math.min(SCORE_CAP, next.score) })
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
  }, [audio, emit, plan, paused])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        inputRef.current.left = true
        event.preventDefault()
      } else if (event.key === 'ArrowRight') {
        inputRef.current.right = true
        event.preventDefault()
      } else if ((event.key === ' ' || event.key === 'Enter') && !pausedRef.current) {
        stateRef.current = launch(stateRef.current)
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

  const movePointer = (clientX: number) => {
    const stage = stageRef.current
    if (!stage || pausedRef.current) return
    const rect = stage.getBoundingClientRect()
    inputRef.current.pointerX = ((clientX - rect.left) / rect.width) * FIELD.width
  }
  const hold = (side: 'left' | 'right', down: boolean) => {
    if (side === 'left') inputRef.current.left = down
    else inputRef.current.right = down
  }
  const fire = () => { if (!pausedRef.current) stateRef.current = launch(stateRef.current) }

  return (
    <div className={`bb-game chapter-${plan.chapter} ${reduceMotion ? 'reduce-motion' : ''} is-${hud.status}`} aria-label="砖域突破游戏区">
      <div className="bb-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {plan.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="bb-rule">
        <span>{plan.detail}</span>
        <em className="bb-par">par {plan.par}s</em>
        {hud.wide && <em className="is-on">加宽</em>}
        {hud.slow && <em className="is-on">慢球</em>}
        {hud.combo > 1 && <em className="is-hot">连击 ×{hud.combo}</em>}
        <em className="is-life">{'♥'.repeat(Math.max(0, hud.lives))}</em>
      </div>
      <div
        ref={stageRef}
        className="bb-stage"
        onPointerDown={(event) => { movePointer(event.clientX); fire() }}
        onPointerMove={(event) => movePointer(event.clientX)}
      >
        <div ref={fieldRef} className="bb-scaler">
          {brickView.map((brick) => (
            <div
              key={brick.id}
              ref={(el) => { if (el) brickEls.current.set(brick.id, el) }}
              className={`bb-brick is-${brick.kind} ${brick.drift ? 'is-drifting' : ''}`}
              style={{ width: brick.w, height: brick.h, transform: `translate(${brick.x}px, ${brick.y}px)` }}
            />
          ))}
          <div ref={dropLayerRef} className="bb-drops" />
          <div ref={ballLayerRef} className="bb-balls" />
          <div ref={paddleRef} className="bb-paddle" style={{ width: PADDLE_BASE, transform: `translate(${FIELD.width / 2 - PADDLE_BASE / 2}px, ${PADDLE_TOP}px)` }} />
        </div>
        {hud.status !== 'playing' && (
          <div className="bb-stamp">
            <span>{hud.status === 'cleared' ? '砖阵清空' : '球落三次'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="bb-actions">
        <div className="bb-pad">
          <button type="button" className="bb-pad-button" aria-label="挡板左移" disabled={hud.status !== 'playing'} onPointerDown={() => hold('left', true)} onPointerUp={() => hold('left', false)} onPointerLeave={() => hold('left', false)} onPointerCancel={() => hold('left', false)}><ChevronLeft size={20} /></button>
          <button type="button" className="bb-pad-button" aria-label="挡板右移" disabled={hud.status !== 'playing'} onPointerDown={() => hold('right', true)} onPointerUp={() => hold('right', false)} onPointerLeave={() => hold('right', false)} onPointerCancel={() => hold('right', false)}><ChevronRight size={20} /></button>
          <button type="button" className="bb-launch" aria-label="发射小球" disabled={hud.status !== 'playing'} onPointerDown={fire}><Rocket size={17} />发射</button>
        </div>
        <button type="button" className="bb-restart" onClick={onRestart}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
