import { useEffect, useMemo, useRef, useState } from 'react'
import { Bird, Coins, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { advance, courseScore, createRunState, CROUCH_H, DT, MAX_LIVES, respawn, RUNNER_H, type RunState } from './logic'
import { generateCourse, MEADOW_LEVEL_COUNT, type Course } from './levels'
import './meadow-run.css'

const PX = 30
const VIEW_M = 21
const CAM_M = 6.5
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW']
const DUCK_KEYS = ['ArrowDown', 'KeyS']

interface Hud { lives: number, coins: number, meters: number, score: number, over: 'completed' | 'failed' | null }

interface RunProps {
  course: Course
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function MeadowRunGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(MEADOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const course = useMemo(() => generateCourse(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  return <MeadowRun key={`${levelNumber}-${epoch}`} course={course} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
}

function MeadowRun({ course, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef<RunState>(createRunState())
  const takenRef = useRef(new Set<number>())
  const timeRef = useRef(0)
  const inputRef = useRef({ hold: false, duck: false, press: false })
  useEffect(() => {
    if (paused) { inputRef.current.press = false; inputRef.current.hold = false; inputRef.current.duck = false }
  }, [paused])
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scalerRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const runnerRef = useRef<HTMLDivElement | null>(null)
  const birdEls = useRef(new Map<number, HTMLDivElement>())
  const coinEls = useRef(new Map<number, HTMLDivElement>())
  const [hud, setHud] = useState<Hud>({ lives: MAX_LIVES, coins: 0, meters: 0, score: 0, over: null })
  const hudRef = useRef(hud)

  useEffect(() => {
    const stage = stageRef.current
    const scaler = scalerRef.current
    if (!stage || !scaler) return
    const fit = () => { scaler.style.transform = `scale(${stage.clientWidth / (VIEW_M * PX)})` }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused) return
    const finish = (won: boolean) => {
      if (doneRef.current) return
      doneRef.current = true
      const score = courseScore(stateRef.current.x, stateRef.current.coins)
      const next = { ...hudRef.current, meters: Math.min(course.quota, Math.floor(stateRef.current.x)), score, over: won ? ('completed' as const) : ('failed' as const) }
      hudRef.current = next
      setHud(next)
      audio.play(won ? 'win' : 'lose')
      emit({ type: won ? 'completed' : 'failed', score })
    }
    const substep = () => {
      const input = inputRef.current
      const result = advance(stateRef.current, { hold: input.hold, duck: input.duck, press: input.press }, course, timeRef.current, takenRef.current, DT)
      timeRef.current += DT
      input.press = false
      stateRef.current = result.state
      if (result.collected.length) {
        for (const index of result.collected) { takenRef.current.add(index); coinEls.current.get(index)?.classList.add('is-taken') }
        audio.play('step')
      }
      if (result.hit) {
        audio.play('mismatch')
        if (result.hit === 'pit') stateRef.current = respawn(stateRef.current, course, result.hitIndex)
        if (stateRef.current.lives <= 0) finish(false)
      } else if (stateRef.current.x >= course.quota) finish(true)
    }
    const paint = () => {
      const state = stateRef.current
      const cam = Math.max(0, state.x - CAM_M)
      if (worldRef.current) worldRef.current.style.transform = `translateX(${(-cam * PX).toFixed(1)}px)`
      if (runnerRef.current) {
        runnerRef.current.style.transform = `translate(${(state.x * PX).toFixed(1)}px, ${(-state.y * PX).toFixed(1)}px) scaleY(${state.crouch ? CROUCH_H / RUNNER_H : 1})`
        runnerRef.current.classList.toggle('is-crouch', state.crouch)
        runnerRef.current.classList.toggle('is-air', state.y > 0.05)
      }
      for (const [index, el] of birdEls.current) {
        const hazard = course.hazards[index]
        const bx = hazard.x - hazard.speed * timeRef.current
        el.style.transform = `translate(${(bx * PX).toFixed(1)}px, ${(-hazard.low * PX).toFixed(1)}px)`
        el.style.visibility = bx > cam - 3 && bx < cam + VIEW_M + 3 ? 'visible' : 'hidden'
      }
    }
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastEmit = 0
    let lastHud = 0
    const frame = (now: number) => {
      acc += Math.min(0.08, (now - last) / 1000)
      last = now
      while (acc >= DT && !doneRef.current) { acc -= DT; substep() }
      paint()
      const state = stateRef.current
      if (!doneRef.current && now - lastEmit > 90) { lastEmit = now; emit({ type: 'score', score: courseScore(state.x, state.coins) }) }
      if (now - lastHud > 140) {
        lastHud = now
        const next = { lives: state.lives, coins: state.coins, meters: Math.min(course.quota, Math.floor(state.x)), score: courseScore(state.x, state.coins), over: hudRef.current.over }
        if (next.lives !== hudRef.current.lives || next.coins !== hudRef.current.coins || next.meters !== hudRef.current.meters || next.score !== hudRef.current.score) {
          hudRef.current = next
          setHud(next)
        }
      }
      if (!doneRef.current) raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, course, emit, paused])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (pausedRef.current) return
      if (JUMP_KEYS.includes(event.code)) {
        event.preventDefault()
        if (!event.repeat) inputRef.current.press = true
        inputRef.current.hold = true
      } else if (DUCK_KEYS.includes(event.code)) {
        event.preventDefault()
        inputRef.current.duck = true
      }
    }
    const up = (event: KeyboardEvent) => {
      if (JUMP_KEYS.includes(event.code)) inputRef.current.hold = false
      else if (DUCK_KEYS.includes(event.code)) inputRef.current.duck = false
    }
    const release = () => { inputRef.current.hold = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [])

  const jumpDown = () => { if (pausedRef.current) return; inputRef.current.press = true; inputRef.current.hold = true }
  const duckDown = () => { if (!pausedRef.current) inputRef.current.duck = true }
  const duckUp = () => { inputRef.current.duck = false }
  const hasBird = course.hazards.some((hazard) => hazard.kind === 'bird')
  const Icon = hasBird ? Bird : Coins
  return (
    <div className={`mr-game ch${course.chapter}${hud.over ? ` is-${hud.over}` : ''}`} aria-label="跳跳旅人游戏区">
      <div className="mr-readout">
        <span>关卡 {String(course.level).padStart(2, '0')} · {course.quota}m 配额 · {course.speed.toFixed(1)} m/s</span>
        <strong>{hud.score} 分 · {hud.coins} 金币 · {'♥'.repeat(Math.max(0, hud.lives)) || '—'}</strong>
      </div>
      <div className="mr-rule">
        <span><Icon size={14} />{course.title}</span>
        <small>{course.detail}</small>
        {course.doubleJump && <em className="is-teal">二段跳</em>}
        {hasBird && <em className="is-coral">疾风鸟</em>}
      </div>
      <div
        ref={stageRef}
        className="mr-stage"
        onPointerDown={() => { if (!doneRef.current) jumpDown() }}
      >
        <div ref={scalerRef} className="mr-scaler">
          <div ref={worldRef} className="mr-world" style={{ width: (course.quota + 30) * PX }}>
            <div className="mr-ground" />
            {Array.from({ length: Math.floor(course.quota / 100) }, (_, index) => (
              <span key={index} className="mr-mark" style={{ transform: `translateX(${(index + 1) * 100 * PX}px)` }}>{(index + 1) * 100}</span>
            ))}
            {course.hazards.map((hazard, index) => {
              if (hazard.kind === 'gap') return <div key={index} className="mr-gap" style={{ width: hazard.width * PX, transform: `translateX(${hazard.x * PX}px)` }} />
              if (hazard.kind === 'block') {
                return <div key={index} className={`mr-block${hazard.height > 1.15 ? ' is-tall' : ''}`} style={{ width: hazard.width * PX, height: hazard.height * PX, transform: `translateX(${hazard.x * PX}px)` }} />
              }
              return (
                <div
                  key={index}
                  ref={(el) => { if (el) birdEls.current.set(index, el); else birdEls.current.delete(index) }}
                  className="mr-bird"
                  style={{ width: hazard.width * PX, height: (hazard.high - hazard.low) * PX, transform: `translate(${hazard.x * PX}px, ${-hazard.low * PX}px)` }}
                ><Bird size={19} /></div>
              )
            })}
            {course.platforms.map((platform, index) => (
              <div key={index} className="mr-platform" style={{ width: platform.width * PX, transform: `translate(${platform.x * PX}px, ${-platform.top * PX}px)` }} />
            ))}
            {course.coins.map((coin, index) => (
              <div
                key={index}
                ref={(el) => { if (el) coinEls.current.set(index, el); else coinEls.current.delete(index) }}
                className="mr-coin"
                style={{ transform: `translate(${(coin.x * PX - 8).toFixed(1)}px, ${(-coin.y * PX - 8).toFixed(1)}px)` }}
              />
            ))}
            <div ref={runnerRef} className="mr-runner" />
          </div>
        </div>
        {paused && !hud.over && <div className="mr-veil">已暂停</div>}
        {hud.over && (
          <div className="mr-panel">
            <strong>{hud.over === 'completed' ? '抵达营地' : '旅程中断'}</strong>
            <span>{hud.over === 'completed' ? `${course.quota}m 跑完 · 金币 ${hud.coins}` : `倒在 ${hud.meters}m · 金币 ${hud.coins}`}</span>
            <em>{hud.score} 分</em>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="mr-progress"><span style={{ transform: `scaleX(${hud.meters / course.quota})` }} /></div>
      <div className="mr-keys">
        <button type="button" className="mr-key is-jump" aria-label="跳跃" onPointerDown={(event) => { event.stopPropagation(); jumpDown() }}>跳 · 空格 / ↑</button>
        <button
          type="button"
          className="mr-key is-duck"
          aria-label="蹲伏"
          onPointerDown={(event) => { event.stopPropagation(); duckDown() }}
          onPointerUp={duckUp}
          onPointerLeave={duckUp}
          onPointerCancel={duckUp}
        >蹲 · ↓</button>
      </div>
    </div>
  )
}
