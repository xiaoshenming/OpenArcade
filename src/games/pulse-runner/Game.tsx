import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Zap } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { advance, createPulseState, MAX_LIVES, totalScore, trySwitch, type PulseState } from './logic'
import { generateCourse, PULSE_LEVEL_COUNT, type Course } from './levels'
import './pulse-runner.css'

const PX = 26
const VIEW_M = 26
const CAM_M = 7
const COLORS = ['#ff5f7e', '#2fd6b8', '#818cf8']
const SWITCH_KEYS = ['Space', 'KeyJ', 'ArrowUp', 'KeyW']

interface Hud { lives: number, meters: number, score: number, over: 'completed' | 'failed' | null }

interface RunProps {
  course: Course
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

export default function PulseRunnerGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(PULSE_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const course = useMemo(() => generateCourse(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  return (
    <PulseRunner
      key={`${levelNumber}-${epoch}`}
      course={course}
      paused={paused}
      emit={emit}
      audio={audio}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function PulseRunner({ course, paused, emit, audio, onRestart }: RunProps) {
  const spec = course.level
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const stateRef = useRef<PulseState>(createPulseState())
  const doneRef = useRef(false)
  const nextRef = useRef(-1)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scalerRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const runnerRef = useRef<HTMLDivElement | null>(null)
  const gateEls = useRef(new Map<number, HTMLDivElement>())
  const [hud, setHud] = useState<Hud>({ lives: MAX_LIVES, meters: 0, score: 0, over: null })
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
      const score = totalScore(stateRef.current)
      const next = { ...hudRef.current, meters: Math.min(spec.quota, Math.floor(stateRef.current.x)), score, over: won ? ('completed' as const) : ('failed' as const) }
      hudRef.current = next
      setHud(next)
      audio.play(won ? 'win' : 'lose')
      emit({ type: won ? 'completed' : 'failed', score })
    }
    const substep = () => {
      const result = advance(stateRef.current, spec, course, 1 / 120)
      stateRef.current = result.state
      for (const event of result.events) audio.play(event === 'match' ? 'match' : event === 'gold' ? 'step' : 'mismatch')
      if (stateRef.current.lives <= 0) finish(false)
      else if (stateRef.current.x >= spec.quota) finish(true)
    }
    const paint = () => {
      const state = stateRef.current
      const cam = Math.max(0, state.x - CAM_M)
      if (worldRef.current) worldRef.current.style.transform = `translateX(${(-cam * PX).toFixed(1)}px)`
      if (runnerRef.current) {
        runnerRef.current.style.transform = `translate(${(state.x * PX - 11).toFixed(1)}px, 0)`
        runnerRef.current.style.background = COLORS[state.color]
        runnerRef.current.classList.toggle('is-cooldown', state.cooldown > 0)
      }
      let nextIndex = -1
      for (let index = state.cursor; index < course.gates.length; index += 1) {
        if (course.gates[index].kind === 'solid') { nextIndex = index; break }
      }
      if (nextIndex !== nextRef.current) {
        gateEls.current.get(nextRef.current)?.classList.remove('is-next')
        gateEls.current.get(nextIndex)?.classList.add('is-next')
        nextRef.current = nextIndex
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
      while (acc >= 1 / 120 && !doneRef.current) { acc -= 1 / 120; substep() }
      paint()
      const state = stateRef.current
      if (!doneRef.current && now - lastEmit > 90) { lastEmit = now; emit({ type: 'score', score: totalScore(state) }) }
      if (now - lastHud > 140) {
        lastHud = now
        const next = { lives: state.lives, meters: Math.min(spec.quota, Math.floor(state.x)), score: totalScore(state), over: hudRef.current.over }
        if (next.lives !== hudRef.current.lives || next.meters !== hudRef.current.meters || next.score !== hudRef.current.score) {
          hudRef.current = next
          setHud(next)
        }
      }
      if (!doneRef.current) raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [audio, course, emit, paused, spec])

  const press = useCallback(() => {
    if (pausedRef.current || doneRef.current) return
    const result = trySwitch(stateRef.current, spec)
    if (result.switched) { stateRef.current = result.state; audio.play('select') }
  }, [audio, spec])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (pausedRef.current || !SWITCH_KEYS.includes(event.code)) return
      event.preventDefault()
      if (!event.repeat) press()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [press])

  const badges = [
    spec.colorCount > 2 ? <em key="c" className="is-violet">三色</em> : null,
    spec.doubleChance > 0 ? <em key="d" className="is-teal">双门</em> : null,
    spec.phantomChance > 0 ? <em key="p" className="is-dim">虚影</em> : null,
    spec.gradient > 0 ? <em key="g" className="is-coral">提速</em> : null,
    spec.goldChance > 0 ? <em key="au" className="is-gold">金门</em> : null,
  ]
  return (
    <div className={`pr-game ch${spec.chapter}${hud.over ? ` is-${hud.over}` : ''}`} aria-label="脉冲行者游戏区">
      <div className="pr-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {spec.quota}m 配额 · {spec.speed.toFixed(1)} m/s</span>
        <strong>{hud.score} 分 · {'♥'.repeat(Math.max(0, hud.lives)) || '—'}</strong>
      </div>
      <div className="pr-rule">
        <span><Zap size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {badges}
      </div>
      <div ref={stageRef} className="pr-stage" onPointerDown={() => press()}>
        <div ref={scalerRef} className="pr-scaler">
          <div ref={worldRef} className="pr-world" style={{ width: (spec.quota + 40) * PX }}>
            <div className="pr-lane" />
            {Array.from({ length: Math.floor(spec.quota / 100) }, (_, index) => (
              <span key={index} className="pr-mark" style={{ transform: `translateX(${(index + 1) * 100 * PX}px)` }}>{(index + 1) * 100}</span>
            ))}
            {course.gates.map((gate, index) => (
              <div
                key={index}
                ref={(el) => { if (el) gateEls.current.set(index, el); else gateEls.current.delete(index) }}
                className={`pr-gate c${gate.color}${gate.kind === 'gold' ? ' is-gold' : ''}${gate.kind === 'phantom' ? ' is-phantom' : ''}`}
                style={{ transform: `translateX(${(gate.x * PX).toFixed(1)}px)` }}
              />
            ))}
            <div ref={runnerRef} className="pr-runner" style={{ background: COLORS[0] }} />
          </div>
        </div>
        {paused && !hud.over && <div className="pr-veil">已暂停</div>}
        {hud.over && (
          <div className="pr-panel">
            <strong>{hud.over === 'completed' ? '冲线成功' : '脉冲中断'}</strong>
            <span>{hud.over === 'completed' ? `${spec.quota}m 跑完 · 同色门全数计分` : `倒在 ${hud.meters}m`}</span>
            <em>{hud.score} 分</em>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="pr-progress"><span style={{ transform: `scaleX(${hud.meters / spec.quota})` }} /></div>
      <div className="pr-keys">
        <div className="pr-swatches">
          {COLORS.slice(0, spec.colorCount).map((color, index) => <i key={color} style={{ background: color, opacity: index === 0 ? 1 : 0.45 }} />)}
        </div>
        <button type="button" className="pr-key" aria-label="切换颜色" onPointerDown={(event) => { event.stopPropagation(); press() }}>变色 · 空格 / 点击</button>
      </div>
    </div>
  )
}
