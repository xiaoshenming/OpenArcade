import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import { FIELD, createBalloonState, popAt, positionOf, radiusOf, step, type BalloonState, type Spawn } from './logic'
import { getBalloonLevel, LEVEL_COUNT, type BalloonLevel } from './levels'
import './balloon-drift.css'

const COLOR_NAMES = { red: '红', gold: '金', teal: '青', violet: '紫' } as const

interface RunProps { plan: BalloonLevel; paused: boolean; emit: (event: GameEvent) => void; audio: GameAudio; onRestart: () => void }

interface Hud { score: number; seconds: number; hits: number; quota: number; lives: number; chains: number; status: BalloonState['status']; final: number }

const readHud = (state: BalloonState): Hud => ({
  score: state.score,
  seconds: Math.max(0, Math.ceil(state.duration - state.time)),
  hits: state.hits,
  quota: state.quota,
  lives: state.lives,
  chains: state.doneChains.length,
  status: state.status,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) => a.score === b.score && a.seconds === b.seconds && a.hits === b.hits && a.lives === b.lives && a.chains === b.chains && a.status === b.status

export default function BalloonDriftGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const plan = useMemo(() => getBalloonLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <BalloonRun key={`${levelNumber}-${epoch}`} plan={plan} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
}

function BalloonRun({ plan, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const initial = useMemo(() => createBalloonState(plan), [plan])
  const stateRef = useRef(initial)
  const [hud, setHud] = useState<Hud>(() => readHud(initial))
  const hudRef = useRef(hud)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const elsRef = useRef(new Map<number, HTMLDivElement>())
  const doneRef = useRef(false)
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

  const finish = useCallback((cleared: boolean, score: number) => {
    if (doneRef.current) return
    doneRef.current = true
    setHud({ ...readHud(stateRef.current), final: score, status: cleared ? 'cleared' : 'over' })
    audio.play(cleared ? 'win' : 'lose')
    emit(cleared ? { type: 'completed', score } : { type: 'failed', score })
  }, [audio, emit])

  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    const els = elsRef.current
    const paint = (state: BalloonState) => {
      const layer = layerRef.current
      if (!layer) return
      const alive = new Set<number>()
      for (const spawn of state.queue) {
        if (state.popped.includes(spawn.id) || state.escaped.includes(spawn.id)) continue
        const pos = positionOf(spawn, state.time, state.windAmp, state.windFreq)
        if (pos.y <= -radiusOf(spawn)) continue
        alive.add(spawn.id)
        let el = els.get(spawn.id)
        if (!el) {
          el = document.createElement('div')
          el.className = spawn.kind === 'spike' ? 'bd-spike' : `bd-balloon is-${spawn.color}${spawn.chain >= 0 ? ' is-chain' : ''}`
          layer.appendChild(el)
          els.set(spawn.id, el)
        }
        el.style.transform = `translate(${pos.x - radiusOf(spawn)}px, ${pos.y - radiusOf(spawn)}px)`
      }
      for (const [id, el] of els) {
        if (!alive.has(id)) {
          el.remove()
          els.delete(id)
        }
      }
    }
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const next = step(stateRef.current, dt)
      stateRef.current = next
      paint(next)
      if (next.status !== 'playing') {
        finish(false, next.score)
        return
      }
      const snapshot = readHud(next)
      if (!sameHud(snapshot, hudRef.current)) {
        hudRef.current = snapshot
        setHud(snapshot)
      }
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => {
      window.cancelAnimationFrame(raf)
      els.forEach((el) => el.remove())
      els.clear()
    }
  }, [audio, finish, paused])

  const burst = (spawn: Spawn, state: BalloonState) => {
    const layer = layerRef.current
    if (!layer || reduceMotion) return
    const pos = positionOf(spawn, state.time, state.windAmp, state.windFreq)
    const el = document.createElement('span')
    el.className = `bd-burst is-${spawn.kind === 'spike' ? 'spike' : spawn.color}`
    el.style.left = `${pos.x}px`
    el.style.top = `${pos.y}px`
    el.addEventListener('animationend', () => el.remove())
    layer.appendChild(el)
  }

  const strike = (clientX: number, clientY: number) => {
    if (pausedRef.current || doneRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const scale = FIELD.width / Math.max(1, rect.width)
    const result = popAt(stateRef.current, (clientX - rect.left) * scale, (clientY - rect.top) * scale)
    stateRef.current = result.state
    if (result.event === 'empty') {
      audio.play('select')
      return
    }
    const spawn = result.state.queue.find((item) => item.id === result.id)
    if (spawn) burst(spawn, result.state)
    audio.play(result.event === 'chain' ? 'win' : result.event === 'pop' ? 'match' : 'mismatch')
    if (result.gained !== 0) emit({ type: 'score', score: result.state.score })
    const snapshot = readHud(result.state)
    hudRef.current = snapshot
    setHud(snapshot)
    if (result.state.status === 'cleared') finish(true, result.state.score)
  }

  const ended = hud.status !== 'playing'
  return (
    <div className={`bd-game chapter-${plan.chapter}`} aria-label="气球浮踪游戏区">
      <div className="bd-readout">
        <span>关卡 {String(plan.level).padStart(2, '0')} · {plan.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="bd-rule">
        <span>{plan.detail}</span>
        <em className={`is-target bd-${plan.target}`}>目标 · {COLOR_NAMES[plan.target]}</em>
        <em className="is-quota">{hud.hits}/{hud.quota}</em>
        {plan.windAmp > 0 && <em className="is-wind">风漂</em>}
        {hud.chains > 0 && <em className="is-chain">串 ×{hud.chains}</em>}
        <em className="is-lives">{'♥'.repeat(hud.lives)}{'♡'.repeat(Math.max(0, plan.lives - hud.lives))}</em>
        <em className="is-time">{hud.seconds}s</em>
      </div>
      <div
        ref={stageRef}
        className="bd-stage"
        onPointerDown={(event) => strike(event.clientX, event.clientY)}
      >
        <div ref={fieldRef} className="bd-field">
          <div ref={layerRef} className="bd-layer" />
        </div>
        {ended && (
          <div className="bd-stamp">
            <span>{hud.status === 'cleared' ? '浮踪归档' : hud.lives <= 0 ? '气球漏网' : '时间到'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="bd-actions">
        <button type="button" className="bd-restart" onClick={onRestart} disabled={ended}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
