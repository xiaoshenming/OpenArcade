import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import {
  AIM_MAX, AIM_MIN, aimRad, BASE_X, beginCharge, createSiegeState, FIELD, MUZZLE, release, setAim,
  shellAt, shotPower, stepSiege, targetX, type SiegeState,
} from './logic'
import { generateSiegeLevel, SIEGE_LEVEL_COUNT, type SiegeCourse } from './levels'
import './cannon-siege.css'

const PX = 8
const STAGE_W = FIELD.width * PX
const STAGE_H = FIELD.height * PX

interface Hud { ammo: number, score: number, combo: number, left: number, over: 'completed' | 'failed' | null }

interface RunProps {
  course: SiegeCourse
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function CannonSiegeGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(SIEGE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const course = useMemo(() => generateSiegeLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  return (
    <CannonSiege
      key={`${levelNumber}-${epoch}`}
      course={course}
      paused={paused}
      emit={emit}
      audio={audio}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function CannonSiege({ course, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef<SiegeState>(createSiegeState(course))
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scalerRef = useRef<HTMLDivElement | null>(null)
  const barrelRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const chargeRef = useRef<HTMLSpanElement | null>(null)
  const dotRefs = useRef<HTMLSpanElement[]>([])
  const targetRefs = useRef(new Map<number, HTMLDivElement>())
  const [hud, setHud] = useState<Hud>({ ammo: course.ammo, score: 0, combo: 0, left: course.targets.length, over: null })
  const hudRef = useRef(hud)

  useEffect(() => {
    const stage = stageRef.current
    const scaler = scalerRef.current
    if (!stage || !scaler) return
    const fit = () => { scaler.style.transform = `scale(${stage.clientWidth / STAGE_W})` }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const finish = useCallback((won: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    const state = stateRef.current
    const next = { ...hudRef.current, score: state.score, over: won ? ('completed' as const) : ('failed' as const) }
    hudRef.current = next
    setHud(next)
    audio.play(won ? 'win' : 'lose')
    emit({ type: won ? 'completed' : 'failed', score: state.score })
  }, [audio, emit])

  useEffect(() => {
    if (paused) return
    const cues: Record<string, 'select' | 'step' | 'match' | 'mismatch'> = { fire: 'select', crack: 'step', hit: 'match', wall: 'mismatch', ground: 'step', lost: 'mismatch' }
    let raf = 0
    let last = performance.now()
    let lastEmit = 0
    let lastHud = 0
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const state = stateRef.current
      const result = stepSiege({ ...state, charging: state.charging && !pausedRef.current }, course, dt)
      stateRef.current = result.state
      for (const event of result.events) {
        if (event === 'clear' || event === 'deplete') continue
        audio.play(cues[event] ?? 'step')
      }
      if (result.state.over) finish(result.state.over === 'completed')
      paint()
      if (!doneRef.current && now - lastEmit > 120) { lastEmit = now; emit({ type: 'score', score: result.state.score }) }
      if (now - lastHud > 140) {
        lastHud = now
        const next = {
          ammo: result.state.ammo, score: result.state.score, combo: result.state.combo,
          left: result.state.destroyed.filter((done) => !done).length, over: hudRef.current.over,
        }
        const prev = hudRef.current
        if (next.ammo !== prev.ammo || next.score !== prev.score || next.combo !== prev.combo || next.left !== prev.left) {
          hudRef.current = next
          setHud(next)
        }
      }
      if (!doneRef.current) raf = window.requestAnimationFrame(frame)
    }
    const paint = () => {
      const state = stateRef.current
      const deg = AIM_MIN + state.aim * (AIM_MAX - AIM_MIN)
      if (barrelRef.current) barrelRef.current.style.transform = `rotate(${-deg}deg)`
      if (chargeRef.current) chargeRef.current.style.transform = `scaleX(${state.charge})`
      const wind = course.wind
      for (let index = 0; index < dotRefs.current.length; index += 1) {
        const dot = dotRefs.current[index]
        if (!dot) continue
        if (state.shot || state.over || pausedRef.current) { dot.style.opacity = '0'; continue }
        const t = (index + 1) * 0.17
        const point = shellAt(t, aimRad(state.aim), shotPower(state.charge), wind)
        const off = point.y < 0 || point.x > FIELD.width
        dot.style.opacity = off ? '0' : '0.5'
        dot.style.transform = `translate(${(point.x * PX - 3).toFixed(1)}px, ${STAGE_H - point.y * PX - 3}px)`
      }
      if (shellRef.current) {
        const shot = state.shot
        if (shot) {
          const t = Math.min(state.time - shot.shell.t0, shot.report.flight)
          const point = shellAt(Math.max(0, t), shot.shell.angle, shot.shell.power, wind)
          shellRef.current.style.opacity = '1'
          shellRef.current.style.transform = `translate(${(point.x * PX - 4).toFixed(1)}px, ${STAGE_H - Math.max(0, point.y) * PX - 4}px)`
        } else shellRef.current.style.opacity = '0'
      }
      for (const [index, el] of targetRefs.current) {
        const target = course.targets[index]
        const x = targetX(target, state.time)
        el.style.transform = `translate(${(x * PX - 17).toFixed(1)}px, ${STAGE_H - target.y * PX - 17}px)`
        el.classList.toggle('is-hit', state.destroyed[index])
        el.classList.toggle('is-cracked', state.cracked[index])
      }
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, course, emit, finish, paused])

  const aimFromPointer = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const scale = rect.width / STAGE_W
    const wx = (clientX - rect.left) / scale / PX
    const wy = FIELD.height - (clientY - rect.top) / scale / PX
    const deg = Math.atan2(Math.max(0.5, wy - MUZZLE), Math.max(1, wx - BASE_X)) * 180 / Math.PI
    stateRef.current = setAim(stateRef.current, (Math.min(AIM_MAX, Math.max(AIM_MIN, deg)) - AIM_MIN) / (AIM_MAX - AIM_MIN))
  }, [])

  const chargeBegin = useCallback((clientX?: number, clientY?: number) => {
    if (pausedRef.current || doneRef.current) return
    if (clientX !== undefined && clientY !== undefined) aimFromPointer(clientX, clientY)
    stateRef.current = beginCharge(stateRef.current)
  }, [aimFromPointer])

  const chargeRelease = useCallback(() => {
    if (pausedRef.current || doneRef.current) return
    const result = release(stateRef.current, course)
    stateRef.current = result.state
    if (result.event) audio.play('select')
  }, [audio, course])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (pausedRef.current || doneRef.current) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) stateRef.current = beginCharge(stateRef.current)
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
        event.preventDefault()
        stateRef.current = setAim(stateRef.current, stateRef.current.aim - 0.035)
      } else if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
        event.preventDefault()
        stateRef.current = setAim(stateRef.current, stateRef.current.aim + 0.035)
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      // 暂停期间松开空格:不放炮,强制取消蓄力
      if (pausedRef.current) {
        const state = stateRef.current
        if (state.charging || state.charge > 0) stateRef.current = { ...state, charging: false, charge: 0 }
        return
      }
      chargeRelease()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [chargeRelease])

  // 暂停瞬间强制取消蓄力:防止挂起中的蓄力在恢复后带着旧力度误射
  useEffect(() => {
    if (!paused) return
    const state = stateRef.current
    if (state.charging || state.charge > 0) stateRef.current = { ...state, charging: false, charge: 0 }
  }, [paused])

  const spec = course.level
  const badges = [
    spec.windMax > 0 ? <em key="w" className="is-teal">侧风</em> : null,
    spec.moveChance > 0 ? <em key="m" className="is-coral">飞靶</em> : null,
    spec.wallChance > 0 ? <em key="b" className="is-brick">高墙</em> : null,
    spec.helmetChance > 0 ? <em key="h" className="is-gold">头盔</em> : null,
  ]
  return (
    <div className={`cs-game ch${spec.chapter}${hud.over ? ` is-${hud.over}` : ''}`} aria-label="炮台攻城游戏区">
      <div className="cs-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {course.wind === 0 ? '无风' : `风 ${course.wind > 0 ? '→' : '←'} ${Math.abs(course.wind).toFixed(1)}`} · 弹药 {hud.ammo}</span>
        <strong>{hud.score} 分 · 连中 ×{hud.combo} · 余靶 {hud.left}</strong>
      </div>
      <div className="cs-rule">
        <span><Crosshair size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {badges}
      </div>
      <div
        ref={stageRef}
        className="cs-stage"
        onPointerDown={(event) => { chargeBegin(event.clientX, event.clientY) }}
        onPointerMove={(event) => { if (stateRef.current.charging) aimFromPointer(event.clientX, event.clientY) }}
        onPointerUp={chargeRelease}
        onPointerLeave={() => { if (stateRef.current.charging) chargeRelease() }}
        onPointerCancel={chargeRelease}
      >
        <div ref={scalerRef} className="cs-scaler">
          <div className="cs-ground" />
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="cs-mark" style={{ transform: `translateX(${(index + 1) * 20 * PX}px)` }}>{(index + 1) * 20}</span>
          ))}
          {course.walls.map((wall, index) => (
            <div
              key={index}
              className="cs-wall"
              style={{ width: wall.width * PX, height: wall.height * PX, transform: `translateX(${wall.x * PX}px)` }}
            />
          ))}
          {course.targets.map((target, index) => (
            <div
              key={index}
              ref={(el) => { if (el) targetRefs.current.set(index, el); else targetRefs.current.delete(index) }}
              className={`cs-target${target.helmet ? ' is-helmet' : ''}`}
            ><i /></div>
          ))}
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} ref={(el) => { if (el) dotRefs.current[index] = el }} className="cs-dot" />
          ))}
          <div ref={shellRef} className="cs-shell" />
          <div className="cs-cannon" style={{ transform: `translate(${(BASE_X - 1.6) * PX}px, ${STAGE_H - 26}px)` }}>
            <div ref={barrelRef} className="cs-barrel" />
            <div className="cs-wheel" />
          </div>
        </div>
        {paused && !hud.over && <div className="cs-veil">已暂停</div>}
        {hud.over && (
          <div className="cs-panel">
            <strong>{hud.over === 'completed' ? '城破获胜' : '弹药耗尽'}</strong>
            <span>{hud.over === 'completed' ? `余弹换分 · 连中最高 ×${hud.combo}` : `还剩 ${hud.left} 座目标`}</span>
            <em>{hud.score} 分</em>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="cs-power"><span ref={chargeRef} /></div>
      <button
        type="button"
        className="cs-key"
        aria-label="按住蓄力松开放炮"
        onPointerDown={(event) => { event.stopPropagation(); chargeBegin() }}
        onPointerUp={chargeRelease}
        onPointerLeave={chargeRelease}
        onPointerCancel={chargeRelease}
      >按住蓄力 · 松开放炮（空格 / ←→ 调仰角）</button>
    </div>
  )
}
