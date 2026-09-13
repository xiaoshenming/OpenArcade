import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Snowflake } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { advance, courseScore, createRollerState, DT, radiusFor, START_LIVES, TRACK_HALF, type RollerState } from './logic'
import { generateCourse, SNOW_LEVEL_COUNT, type Course } from './levels'
import './snow-roller.css'

const PX = 24
const VIEW_W = (TRACK_HALF * 2 + 1.2) * PX
const VIEW_H = 470
const BALL_LIFT = 88

interface Hud { lives: number, flakes: number, meters: number, score: number, radius: number, crushes: number, over: 'completed' | 'failed' | null }

interface RunProps { course: Course, paused: boolean, emit: (event: GameEvent) => void, audio: GameAudio, onRestart: () => void }

export default function SnowRollerGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(SNOW_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const course = useMemo(() => generateCourse(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  return <SnowRoller key={`${levelNumber}-${epoch}`} course={course} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
}

function SnowRoller({ course, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef<RollerState>(createRollerState())
  const takenRef = useRef(new Set<number>())
  const brokenRef = useRef(new Set<number>())
  const dirsRef = useRef({ left: false, right: false })
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scalerRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const ballRef = useRef<HTMLDivElement | null>(null)
  const obstacleEls = useRef(new Map<number, HTMLDivElement>())
  const flakeEls = useRef(new Map<number, HTMLDivElement>())
  const [hud, setHud] = useState<Hud>({ lives: START_LIVES, flakes: 0, meters: 0, score: 0, radius: radiusFor(0), crushes: 0, over: null })
  const hudRef = useRef(hud)

  useEffect(() => {
    if (paused) { dirsRef.current.left = false; dirsRef.current.right = false }
  }, [paused])

  useEffect(() => {
    const stage = stageRef.current
    const scaler = scalerRef.current
    if (!stage || !scaler) return
    const fit = () => {
      const scale = Math.min(stage.clientWidth / VIEW_W, stage.clientHeight / VIEW_H)
      scaler.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused) return
    const steerOf = () => (dirsRef.current.right ? 1 : 0) - (dirsRef.current.left ? 1 : 0)
    const finish = (won: boolean) => {
      if (doneRef.current) return
      doneRef.current = true
      const state = stateRef.current
      const score = courseScore(state.z, state.flakes, state.crushes)
      const next = {
        lives: state.lives, flakes: state.flakes, meters: Math.min(course.quota, Math.floor(state.z)), score,
        radius: radiusFor(state.flakes), crushes: state.crushes, over: won ? ('completed' as const) : ('failed' as const),
      }
      hudRef.current = next
      setHud(next)
      audio.play(won ? 'win' : 'lose')
      emit({ type: won ? 'completed' : 'failed', score })
    }
    const substep = () => {
      const result = advance(stateRef.current, { steer: steerOf() }, course, takenRef.current, brokenRef.current, DT)
      stateRef.current = result.state
      for (const index of result.collected) { takenRef.current.add(index); flakeEls.current.get(index)?.classList.add('is-taken') }
      for (const index of result.crushed) { brokenRef.current.add(index); obstacleEls.current.get(index)?.classList.add('is-broken') }
      if (result.collected.length) audio.play('step')
      if (result.crushed.length) audio.play('match')
      if (result.events.includes('ramp')) audio.play('select')
      if (result.hitIndex >= 0) audio.play('mismatch')
      if (result.won) finish(true)
      else if (result.dead) finish(false)
    }
    const paint = () => {
      const state = stateRef.current
      const radius = radiusFor(state.flakes)
      const sight = course.blizzard > 0 ? course.blizzard : Number.POSITIVE_INFINITY
      if (worldRef.current) worldRef.current.style.transform = `translateY(${(state.z * PX).toFixed(1)}px)`
      if (ballRef.current) {
        ballRef.current.style.transform = `translateX(-50%) translateX(${(state.x * PX).toFixed(1)}px)`
        ballRef.current.style.width = `${(radius * 2 * PX).toFixed(1)}px`
        ballRef.current.style.height = `${(radius * 2 * PX).toFixed(1)}px`
        ballRef.current.classList.toggle('is-air', state.air > 0.12)
        ballRef.current.classList.toggle('is-hurt', state.iframes > 1)
      }
      for (const [index, el] of obstacleEls.current) {
        const gone = brokenRef.current.has(index) || course.obstacles[index].z > state.z + sight
        el.style.visibility = gone ? 'hidden' : 'visible'
      }
      for (const [index, el] of flakeEls.current) {
        const gone = takenRef.current.has(index) || course.flakes[index].z > state.z + sight
        el.style.visibility = gone ? 'hidden' : 'visible'
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
      if (!doneRef.current && now - lastEmit > 90) {
        lastEmit = now
        emit({ type: 'score', score: courseScore(state.z, state.flakes, state.crushes) })
      }
      if (now - lastHud > 140) {
        lastHud = now
        const next = {
          lives: state.lives, flakes: state.flakes, meters: Math.min(course.quota, Math.floor(state.z)),
          score: courseScore(state.z, state.flakes, state.crushes), radius: radiusFor(state.flakes), crushes: state.crushes,
          over: hudRef.current.over,
        }
        if (next.lives !== hudRef.current.lives || next.flakes !== hudRef.current.flakes || next.meters !== hudRef.current.meters || next.score !== hudRef.current.score || next.radius !== hudRef.current.radius) {
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
    const apply = (code: string, down: boolean) => {
      if (code === 'ArrowLeft' || code === 'KeyA') dirsRef.current.left = down
      else if (code === 'ArrowRight' || code === 'KeyD') dirsRef.current.right = down
      else return false
      return true
    }
    const down = (event: KeyboardEvent) => {
      if (pausedRef.current || !apply(event.code, true)) return
      event.preventDefault()
    }
    const up = (event: KeyboardEvent) => { apply(event.code, false) }
    const release = () => { dirsRef.current.left = false; dirsRef.current.right = false }
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

  const press = (side: 'left' | 'right', down: boolean) => {
    if (down && (pausedRef.current || doneRef.current)) return
    dirsRef.current[side] = down
  }
  return (
    <div className={`sr-game ch${course.chapter}${paused ? ' is-paused' : ''}${hud.over ? ` is-${hud.over}` : ''}`} aria-label="雪球滚滚游戏区">
      <div className="sr-readout">
        <span>关卡 {String(course.level).padStart(2, '0')} · {course.quota}m · 目标半径 {course.targetRadius.toFixed(2)}m</span>
        <strong>{hud.score} 分 · 雪花 {hud.flakes} · {'♥'.repeat(Math.max(0, hud.lives)) || '—'}</strong>
      </div>
      <div className="sr-rule">
        <span><Snowflake size={14} />{course.title}</span>
        <small>{course.detail}</small>
        {course.ramps.length > 0 && <em className="is-teal">跳台</em>}
        {course.ice && <em className="is-coral">冰面</em>}
        {course.blizzard > 0 && <em className="is-gold">风雪</em>}
        {course.obstacles.some((obstacle) => obstacle.kind === 'snowman') && <em className="is-violet">雪人王</em>}
      </div>
      <div
        ref={stageRef}
        className="sr-stage"
        onPointerDown={(event) => {
          if (pausedRef.current || doneRef.current) return
          const rect = event.currentTarget.getBoundingClientRect()
          const left = event.clientX - rect.left < rect.width / 2
          dirsRef.current.left = left
          dirsRef.current.right = !left
        }}
      >
        <div ref={scalerRef} className="sr-scaler">
          <div ref={worldRef} className="sr-world" style={{ height: (course.quota + 40) * PX }}>
            {Array.from({ length: Math.floor(course.quota / 100) }, (_, index) => (
              <span key={index} className="sr-mark" style={{ bottom: (index + 1) * 100 * PX }}>{(index + 1) * 100}</span>
            ))}
            {course.ramps.map((ramp, index) => (
              <div key={`r${index}`} className="sr-ramp" style={{ width: ramp.half * 2 * PX, height: 22, bottom: ramp.z * PX, transform: `translateX(-50%) translateX(${(ramp.x * PX).toFixed(1)}px)` }} />
            ))}
            {course.obstacles.map((obstacle, index) => (
              <div
                key={`o${index}`}
                ref={(el) => { if (el) obstacleEls.current.set(index, el); else obstacleEls.current.delete(index) }}
                className={`sr-${obstacle.kind}${obstacle.kind === 'rock' && !Number.isFinite(obstacle.crushAt) ? ' is-big' : ''}`}
                style={{ width: obstacle.half * 2 * PX, height: obstacle.half * 2 * PX, bottom: obstacle.z * PX, transform: `translateX(-50%) translateX(${(obstacle.x * PX).toFixed(1)}px)` }}
              />
            ))}
            {course.flakes.map((flake, index) => (
              <div
                key={`f${index}`}
                ref={(el) => { if (el) flakeEls.current.set(index, el); else flakeEls.current.delete(index) }}
                className={`sr-flake${flake.high ? ' is-high' : ''}`}
                style={{ bottom: flake.z * PX, transform: `translateX(-50%) translateX(${(flake.x * PX).toFixed(1)}px)` }}
              />
            ))}
            <div ref={ballRef} className="sr-ball" style={{ bottom: BALL_LIFT }} />
          </div>
        </div>
        {course.blizzard > 0 && <div className="sr-fog" />}
        {paused && !hud.over && <div className="sr-veil">已暂停</div>}
        {hud.over && (
          <div className="sr-panel">
            <strong>{hud.over === 'completed' ? '滚到山脚' : '雪球散架'}</strong>
            <span>{hud.over === 'completed' ? `半径 ${hud.radius.toFixed(2)}m · 碾碎 ${hud.crushes} 处 · 雪花 ${hud.flakes}` : `倒在 ${hud.meters}m · 雪花 ${hud.flakes}`}</span>
            <em>{hud.score} 分</em>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="sr-progress">
        <span style={{ transform: `scaleX(${Math.min(1, hud.meters / course.quota)})` }} />
        <i style={{ transform: `scaleX(${Math.min(1, hud.radius / course.targetRadius)})` }} />
      </div>
      <div className="sr-keys">
        <button
          type="button"
          className="sr-key"
          aria-label="向左滚"
          onPointerDown={(event) => { event.stopPropagation(); press('left', true) }}
          onPointerUp={() => press('left', false)}
          onPointerLeave={() => press('left', false)}
          onPointerCancel={() => press('left', false)}
        >◀ 左滚</button>
        <button
          type="button"
          className="sr-key"
          aria-label="向右滚"
          onPointerDown={(event) => { event.stopPropagation(); press('right', true) }}
          onPointerUp={() => press('right', false)}
          onPointerLeave={() => press('right', false)}
          onPointerCancel={() => press('right', false)}
        >右滚 ▶</button>
      </div>
    </div>
  )
}
