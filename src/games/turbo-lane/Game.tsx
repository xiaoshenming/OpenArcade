import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import {
  CAR_WIDTH, FIELD, LANE_X, PLAYER_CY, PPM, SCORE_CAP, TRUCK_WIDTH, step,
  type GameState, type InputState, type StepEvent,
} from './logic'
import { createTurboState, getTurboLevel, LEVEL_COUNT } from './levels'
import './turbo-lane.css'

interface Hud {
  score: number
  lives: number
  distance: number
  quota: number
  coins: number
  boosting: boolean
  status: GameState['status']
  final: number
}

interface RunProps { level: number; paused: boolean; emit: (event: GameEvent) => void; audio: GameAudio; onRestart: () => void }

const readHud = (state: GameState, boosting: boolean): Hud => ({
  score: Math.min(SCORE_CAP, state.score),
  lives: state.lives,
  distance: Math.floor(state.distance),
  quota: state.quota,
  coins: state.coinsGot,
  boosting,
  status: state.status,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) =>
  a.score === b.score && a.lives === b.lives && a.distance === b.distance && a.coins === b.coins && a.boosting === b.boosting && a.status === b.status

export default function TurboLaneGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <LaneRun key={`${levelNumber}-${epoch}`} level={levelNumber} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
  )
}

function LaneRun({ level, paused, emit, audio, onRestart }: RunProps) {
  const spec = useMemo(() => getTurboLevel(level), [level])
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef(createTurboState(level))
  const [hud, setHud] = useState<Hud>(() => readHud(createTurboState(level), false))
  const hudRef = useRef(hud)
  const doneRef = useRef(false)
  const inputRef = useRef<InputState>({ left: false, right: false, throttle: false })
  const visXRef = useRef(LANE_X[1])
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const carLayerRef = useRef<HTMLDivElement | null>(null)
  const coinLayerRef = useRef<HTMLDivElement | null>(null)
  const carEls = useRef(new Map<number, HTMLDivElement>())
  const coinEls = useRef(new Map<number, HTMLDivElement>())
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
    const paint = (state: GameState, visX: number) => {
      const player = playerRef.current
      if (player) {
        player.style.transform = `translate(${visX - CAR_WIDTH / 2}px, ${PLAYER_CY - 9}px)`
        player.classList.toggle('is-invuln', state.invuln > 0 && !reduceMotion)
      }
      const progress = progressRef.current
      if (progress) progress.style.transform = `scaleX(${Math.min(1, state.distance / state.quota)})`
      const carLayer = carLayerRef.current
      if (carLayer) {
        const alive = new Set<number>()
        for (const car of state.cars) {
          alive.add(car.id)
          let el = carEls.current.get(car.id)
          if (!el) {
            el = document.createElement('div')
            el.className = `tl-car is-${car.kind}`
            el.style.width = `${car.kind === 'truck' ? TRUCK_WIDTH : CAR_WIDTH}px`
            el.style.height = `${car.half * 2 * PPM}px`
            carLayer.appendChild(el)
            carEls.current.set(car.id, el)
          }
          el.style.transform = `translate(${LANE_X[car.lane] - (car.kind === 'truck' ? TRUCK_WIDTH : CAR_WIDTH) / 2}px, ${PLAYER_CY - (car.y + car.half) * PPM}px)`
        }
        for (const [id, el] of carEls.current) {
          if (!alive.has(id)) {
            el.remove()
            carEls.current.delete(id)
          }
        }
      }
      const coinLayer = coinLayerRef.current
      if (coinLayer) {
        const alive = new Set<number>()
        for (const coin of state.coins) {
          alive.add(coin.id)
          let el = coinEls.current.get(coin.id)
          if (!el) {
            el = document.createElement('div')
            el.className = 'tl-coin'
            coinLayer.appendChild(el)
            coinEls.current.set(coin.id, el)
          }
          el.style.transform = `translate(${LANE_X[coin.lane] - 9}px, ${PLAYER_CY - coin.y * PPM - 9}px)`
        }
        for (const [id, el] of coinEls.current) {
          if (!alive.has(id)) {
            el.remove()
            coinEls.current.delete(id)
          }
        }
      }
    }
    const playCue = (event: StepEvent, wasBoosting: boolean, boosting: boolean) => {
      if (event === 'switch') audio.play('select')
      else if (event === 'coin') audio.play('match')
      else if (event === 'hit') audio.play('mismatch')
      else if (!wasBoosting && boosting) audio.play('step')
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
    let wasBoosting = false
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const next = step(stateRef.current, inputRef.current, dt)
      stateRef.current = next
      const target = LANE_X[next.lane]
      visXRef.current += (target - visXRef.current) * Math.min(1, dt * 13)
      const boosting = next.boost > 0 && inputRef.current.throttle
      paint(next, visXRef.current)
      for (const event of next.events) playCue(event, wasBoosting, boosting)
      wasBoosting = boosting
      if (next.status !== 'playing') {
        finish(next)
        return
      }
      if (next.score !== shownScore && now - lastEmit > 64) {
        shownScore = next.score
        lastEmit = now
        emit({ type: 'score', score: next.score })
      }
      const snapshot = readHud(next, boosting)
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
    // 暂停时不注册 keydown：键盘输入无法在暂停期间改变车辆状态；keyup 常驻以防按键卡住。
    const keyOf = (event: KeyboardEvent): 'left' | 'right' | 'throttle' | null => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') return 'left'
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') return 'right'
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') return 'throttle'
      return null
    }
    const up = (event: KeyboardEvent) => {
      const key = keyOf(event)
      if (key) inputRef.current[key] = false
    }
    window.addEventListener('keyup', up)
    if (paused) return () => window.removeEventListener('keyup', up)
    const down = (event: KeyboardEvent) => {
      const key = keyOf(event)
      if (!key) return
      event.preventDefault()
      inputRef.current[key] = true
    }
    window.addEventListener('keydown', down)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [paused])

  const hold = (key: 'left' | 'right' | 'throttle', down: boolean) => {
    if (pausedRef.current) return
    inputRef.current[key] = down
  }

  return (
    <div className={`tl-game chapter-${spec.chapter} ${reduceMotion ? 'reduce-motion' : ''} is-${hud.status}`} aria-label="赛道争锋游戏区">
      <div className="tl-readout">
        <span>关卡 {String(level).padStart(2, '0')} · {spec.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="tl-rule">
        <span>{spec.detail}</span>
        {spec.boost > 0 && <em className={hud.boosting ? 'is-on' : ''}>{hud.boosting ? '油门×1.5' : '油门'}</em>}
        {spec.coins.length > 0 && <em className="is-coin">金币 ×{hud.coins}</em>}
        <em className="is-dist">{hud.distance}/{hud.quota}m</em>
        <em className="is-life">{'◆'.repeat(Math.max(0, hud.lives))}</em>
      </div>
      <div ref={stageRef} className="tl-stage">
        <div ref={fieldRef} className="tl-scaler">
          <div ref={progressRef} className="tl-progress" />
          <div ref={coinLayerRef} className="tl-coins" />
          <div ref={carLayerRef} className="tl-cars" />
          <div ref={playerRef} className="tl-player" style={{ width: CAR_WIDTH, height: 18 }} />
        </div>
        {hud.status !== 'playing' && (
          <div className="tl-stamp">
            <span>{hud.status === 'cleared' ? '到达终点' : '连环追尾'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="tl-actions">
        <div className="tl-pad">
          <button type="button" className="tl-pad-button" aria-label="车道左移" disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('left', true)} onPointerUp={() => hold('left', false)}
            onPointerLeave={() => hold('left', false)} onPointerCancel={() => hold('left', false)}
          ><ChevronLeft size={20} /></button>
          <button type="button" className="tl-pad-button" aria-label="车道右移" disabled={hud.status !== 'playing'}
            onPointerDown={() => hold('right', true)} onPointerUp={() => hold('right', false)}
            onPointerLeave={() => hold('right', false)} onPointerCancel={() => hold('right', false)}
          ><ChevronRight size={20} /></button>
        </div>
        <button
          type="button" className={`tl-throttle ${hud.boosting ? 'is-on' : ''}`} aria-label="油门加速"
          disabled={hud.status !== 'playing' || spec.boost <= 0}
          onPointerDown={() => hold('throttle', true)} onPointerUp={() => hold('throttle', false)}
          onPointerLeave={() => hold('throttle', false)} onPointerCancel={() => hold('throttle', false)}
        ><ChevronUp size={20} />油门</button>
        <button type="button" className="tl-restart" onClick={onRestart}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
