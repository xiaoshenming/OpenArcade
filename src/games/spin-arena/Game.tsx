import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { stepArena, type ArenaInput, type ArenaState } from './logic'
import { createSpinArenaState, getSpinLevel, SPIN_LEVEL_COUNT } from './levels'
import './spin-arena.css'

const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' } as const
type KeyDir = (typeof KEY_DIRS)[keyof typeof KEY_DIRS]
type KeyState = Record<KeyDir, boolean>
const PAD_DIRS = [
  { dir: 'up', icon: ChevronUp, label: '上' },
  { dir: 'left', icon: ChevronLeft, label: '左' },
  { dir: 'down', icon: ChevronDown, label: '下' },
  { dir: 'right', icon: ChevronRight, label: '右' },
] as const
const VIEW_SPAN = 220
const STEP = 1 / 60

interface Hud { timeLeft: number; spin: number; score: number; foes: number; energy: number; over: 'completed' | 'failed' | null }

function readInput(keys: KeyState, pointer: { x: number; y: number } | null, world: ArenaState, stage: HTMLElement | null): ArenaInput {
  const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const ay = (keys.down ? 1 : 0) - (keys.up ? 1 : 0)
  if (ax || ay) {
    const len = Math.hypot(ax, ay)
    return { ax: ax / len, ay: ay / len }
  }
  if (pointer && stage) {
    const rect = stage.getBoundingClientRect()
    const scale = rect.width / VIEW_SPAN
    const px = rect.left + rect.width / 2 + world.player.x * scale
    const py = rect.top + rect.height / 2 + world.player.y * scale
    const dx = pointer.x - px
    const dy = pointer.y - py
    const len = Math.hypot(dx, dy)
    if (len > 8) return { ax: dx / len, ay: dy / len }
  }
  return { ax: 0, ay: 0 }
}

export default function SpinArenaGame(props: GameModuleProps) {
  const requested = Number(props.level)
  const level = Math.min(SPIN_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)))
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  const { emit, muted, paused } = props
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  const restart = useCallback(() => setEpoch((value) => value + 1), [])
  return <SpinRing key={`${level}-${epoch}`} level={level} paused={paused} emit={emit} audio={audio} onRestart={restart} />
}

interface RingProps {
  level: number
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

function SpinRing({ level, paused, emit, audio, onRestart }: RingProps) {
  const spec = useMemo(() => getSpinLevel(level), [level])
  const initial = useMemo(() => createSpinArenaState(level), [level])
  const worldRef = useRef<ArenaState>(initial)
  const doneRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const enemyRefs = useRef(new Map<number, HTMLDivElement>())
  const dotRefs = useRef(new Map<number, HTMLSpanElement>())
  const keyRef = useRef<KeyState>({ up: false, down: false, left: false, right: false })
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const [hud, setHud] = useState<Hud>({ timeLeft: initial.duration, spin: initial.player.spin, score: 0, foes: initial.enemies.length, energy: 0, over: null })
  const hudRef = useRef(hud)

  const finish = useCallback((world: ArenaState) => {
    if (doneRef.current) return
    doneRef.current = true
    const won = world.status === 'completed'
    audio.play(won ? 'win' : 'lose')
    emit({ type: won ? 'completed' : 'failed', score: world.score })
    const next: Hud = {
      timeLeft: Math.max(0, world.duration - world.time), spin: world.player.spin, score: world.score,
      foes: world.enemies.filter((enemy) => enemy.alive).length, energy: world.energy,
      over: won ? 'completed' : 'failed',
    }
    hudRef.current = next
    setHud(next)
  }, [audio, emit])

  useEffect(() => {
    if (paused) {
      keyRef.current = { up: false, down: false, left: false, right: false }
      pointerRef.current = null
      return
    }
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastEmit = 0
    let lastHud = 0
    const frame = (now: number) => {
      acc += Math.min(0.08, (now - last) / 1000)
      last = now
      while (acc >= STEP && !doneRef.current) {
        acc -= STEP
        const input = readInput(keyRef.current, pointerRef.current, worldRef.current, stageRef.current)
        worldRef.current = stepArena(worldRef.current, input, STEP)
        const world = worldRef.current
        if (world.events.includes('collect')) audio.play('step')
        if (world.events.includes('knockout')) audio.play('match')
        if (world.status !== 'running') finish(world)
      }
      acc = Math.min(acc, STEP)
      const world = worldRef.current
      const stage = stageRef.current
      if (stage) {
        const scale = stage.clientWidth / VIEW_SPAN
        if (ringRef.current) {
          const size = Math.round(world.radius * 2 * scale)
          if (ringRef.current.dataset.size !== String(size)) {
            ringRef.current.dataset.size = String(size)
            ringRef.current.style.width = `${size}px`
            ringRef.current.style.height = `${size}px`
          }
        }
        const place = (el: HTMLElement | null, x: number, y: number) => {
          if (el) el.style.transform = `translate(calc(${(x * scale).toFixed(1)}px - 50%), calc(${(y * scale).toFixed(1)}px - 50%))`
        }
        place(playerRef.current, world.player.x, world.player.y)
        for (const [index, el] of enemyRefs.current) {
          const enemy = world.enemies[index]
          if (!enemy) continue
          place(el, enemy.x, enemy.y)
          el.classList.toggle('is-out', !enemy.alive)
        }
        for (const [index, el] of dotRefs.current) {
          const dot = world.dots[index]
          if (dot) place(el, dot.x, dot.y)
          el.classList.toggle('is-taken', Boolean(dot?.taken))
        }
      }
      const now2 = performance.now()
      if (!doneRef.current && now2 - lastEmit > 90) {
        lastEmit = now2
        emit({ type: 'score', score: world.score })
      }
      if (now2 - lastHud > 140) {
        lastHud = now2
        const next: Hud = {
          timeLeft: Math.max(0, world.duration - world.time), spin: world.player.spin, score: world.score,
          foes: world.enemies.filter((enemy) => enemy.alive).length, energy: world.energy, over: hudRef.current.over,
        }
        const prev = hudRef.current
        if (next.timeLeft !== prev.timeLeft || next.spin !== prev.spin || next.score !== prev.score || next.foes !== prev.foes || next.energy !== prev.energy) {
          hudRef.current = next
          setHud(next)
        }
      }
      if (!doneRef.current) raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, emit, finish, paused])

  useEffect(() => {
    if (paused) return
    const down = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key as keyof typeof KEY_DIRS]
      if (!dir) return
      event.preventDefault()
      keyRef.current[dir] = true
    }
    const up = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key as keyof typeof KEY_DIRS]
      if (dir) keyRef.current[dir] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [paused])

  const setPad = (dir: KeyDir, pressed: boolean) => {
    if (paused || doneRef.current) return
    keyRef.current[dir] = pressed
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || doneRef.current) return
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerLeave = () => { pointerRef.current = null }
  const chips = [spec.shrink ? '缩圈' : '', spec.smart ? '追击 AI' : '', spec.dots <= 8 ? '稀疏能量' : ''].filter(Boolean)
  const spinRatio = Math.max(0, Math.min(1, hud.spin / 100))
  return (
    <div className={`spin-game ch${spec.chapter} ${paused ? 'is-paused' : ''}`} aria-label="陀螺角斗游戏区">
      <div className="spin-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{hud.score} 分 · 剩 {hud.timeLeft.toFixed(0)} 秒 · 敌陀 {hud.foes} · 能量 {hud.energy}</strong>
      </div>
      <div className="spin-rule">
        <span>{spec.detail}</span>
        {chips.map((chip) => <em key={chip}>{chip}</em>)}
      </div>
      <div className="spin-stage" ref={stageRef} onPointerMove={onPointerMove} onPointerDown={onPointerMove} onPointerLeave={onPointerLeave} aria-label="圆形竞技场">
        <div className="spin-ring" ref={ringRef} />
        {initial.dots.map((_, index) => (
          <span key={index} className="spin-dot" ref={(el) => { if (el) dotRefs.current.set(index, el); else dotRefs.current.delete(index) }} />
        ))}
        {initial.enemies.map((_, index) => (
          <div key={index} className="spin-body spin-enemy" ref={(el) => { if (el) enemyRefs.current.set(index, el); else enemyRefs.current.delete(index) }} />
        ))}
        <div ref={playerRef} className="spin-body spin-player" />
        {paused && !hud.over && <div className="spin-veil">已暂停</div>}
        {hud.over && (
          <div className={`spin-panel ${hud.over === 'completed' ? 'is-win' : 'is-lose'}`}>
            <strong>{hud.over === 'completed' ? '守环成功' : '陀螺离场'}</strong>
            <span>{hud.over === 'completed' ? `撑满回合 · 能量 ${hud.energy}` : hud.spin <= 0 ? '转速熄火 · 记得补能量' : '被撞出环外'}</span>
            <em>{hud.score} 分</em>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="spin-meters">
        <label>转速<span><i style={{ transform: `scaleX(${spinRatio})` }} /></span></label>
        <label>回合<span><i style={{ transform: `scaleX(${hud.timeLeft / initial.duration})` }} /></span></label>
      </div>
      <div className="spin-controls">
        <div className="spin-pad" aria-label="方向按钮">
          {PAD_DIRS.map(({ dir, icon: Icon, label }) => (
            <button
              key={dir}
              className={`spin-pad-button pad-${dir}`}
              aria-label={`向${label}推进`}
              disabled={paused || Boolean(hud.over)}
              onPointerDown={(event) => { event.stopPropagation(); setPad(dir, true) }}
              onPointerUp={() => setPad(dir, false)}
              onPointerLeave={() => setPad(dir, false)}
              onPointerCancel={() => setPad(dir, false)}
            >
              <Icon size={20} />
            </button>
          ))}
        </div>
        <button className="spin-restart" onClick={() => { if (!paused) { audio.play('select'); onRestart() } }} disabled={paused}>
          <RotateCcw size={17} />重开本关
        </button>
      </div>
    </div>
  )
}
