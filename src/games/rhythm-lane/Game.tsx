import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Layers, Music2, RotateCcw, Waves, Zap } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { applyHit, capScore, clampHp, damageFor, findTarget, GOOD_MS, MAX_HP, resolveHit, visualDistance, type Judgement } from './logic'
import { generateChart, getLaneLevel, LANE_COUNT, LANE_KEYS, RHYTHM_LEVEL_COUNT, SLOW_SCALE } from './levels'
import './rhythm-lane.css'

const PX_PER_MS = 0.3
const HIDE_PX = 640
const KEY_LANES: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 }
const CHAPTER_ICONS = [Music2, Activity, Layers, Waves, Zap]
const NOTE_STATES = ['is-pending', 'is-perfect', 'is-good', 'is-missed', 'is-faded']
const FADED = 4

interface Flash {
  readonly text: string
  readonly kind: Judgement
  readonly key: number
}

const RhythmLaneRun = ({ paused, muted, emit, level = 1 }: GameModuleProps) => {
  const levelNumber = Math.min(RHYTHM_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getLaneLevel(levelNumber), [levelNumber])
  const chart = useMemo(() => generateChart(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const laneNotes = useMemo(() => Array.from({ length: LANE_COUNT }, (_, lane) =>
    chart.notes.map((note, index) => ({ note, index })).filter((item) => item.note.lane === lane)), [chart])
  const [statuses, setStatuses] = useState<number[]>(() => chart.notes.map(() => 0))
  const [hp, setHp] = useState(MAX_HP)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [over, setOver] = useState<'completed' | 'failed' | null>(null)
  const [tick, setTick] = useState(0)
  const elapsedRef = useRef(0)
  const pausedRef = useRef(paused)
  const statusRef = useRef<number[]>(statuses)
  const cursorRef = useRef(0)
  const hpRef = useRef(MAX_HP)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const bestRef = useRef(0)
  const overRef = useRef(false)
  const engineRef = useRef<(lane: number) => void>(() => undefined)

  useEffect(() => { emit({ type: 'ready' }); emit({ type: 'started' }) }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => { pausedRef.current = paused }, [paused])

  // Freeze the flash while paused: no timer is scheduled and a pending one is cleared.
  useEffect(() => {
    if (!flash || paused) return
    const timer = window.setTimeout(() => setFlash(null), 340)
    return () => window.clearTimeout(timer)
  }, [flash, paused])

  useEffect(() => {
    const { notes, songMs, warmupUntilMs } = chart
    const finish = (won: boolean) => {
      if (overRef.current) return
      overRef.current = true
      setOver(won ? 'completed' : 'failed')
      audio.play(won ? 'win' : 'lose')
      emit({ type: won ? 'completed' : 'failed', score: capScore(scoreRef.current) })
    }
    const registerMiss = (index: number, songTime: number) => {
      statusRef.current[index] = 3
      hpRef.current = clampHp(hpRef.current - damageFor('miss', songTime < warmupUntilMs))
      comboRef.current = 0
      setCombo(0); setHp(hpRef.current); setStatuses([...statusRef.current])
      setFlash({ text: 'MISS', kind: 'miss', key: songTime + index })
      audio.play('mismatch')
      emit({ type: 'score', score: capScore(scoreRef.current) })
      if (hpRef.current <= 0) finish(false)
    }
    const hit = (lane: number) => {
      if (paused || overRef.current) return
      const songTime = elapsedRef.current
      const target = findTarget(notes, statusRef.current, songTime, lane)
      if (target < 0) { audio.play('select'); return }
      const kind = resolveHit(notes[target], songTime)
      if (kind === 'decoy') {
        registerMiss(target, songTime)
        return
      }
      statusRef.current[target] = kind === 'perfect' ? 1 : 2
      const outcome = applyHit(kind, comboRef.current)
      comboRef.current = outcome.combo
      scoreRef.current += outcome.gain + outcome.bonus
      bestRef.current = Math.max(bestRef.current, outcome.combo)
      if (kind === 'good') {
        hpRef.current = clampHp(hpRef.current - damageFor('good', songTime < warmupUntilMs))
        setHp(hpRef.current)
      }
      setCombo(outcome.combo); setBest(bestRef.current); setScore(scoreRef.current)
      setStatuses([...statusRef.current])
      setFlash({ text: kind === 'perfect' ? 'PERFECT' : 'GOOD', kind, key: songTime + target })
      audio.play(kind === 'perfect' ? 'match' : 'step')
      emit({ type: 'score', score: capScore(scoreRef.current) })
      if (hpRef.current <= 0) finish(false)
    }
    engineRef.current = hit
    if (paused || overRef.current) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const songTime = elapsedRef.current + Math.min(64, now - last)
      last = now
      elapsedRef.current = songTime
      while (cursorRef.current < notes.length && notes[cursorRef.current].time + GOOD_MS < songTime) {
        const index = cursorRef.current
        if (statusRef.current[index] === 0) {
          // An ignored ghost lure simply fades away: leaving it alone is correct play.
          if (notes[index].decoy) {
            statusRef.current[index] = FADED
            setStatuses([...statusRef.current])
          } else {
            registerMiss(index, songTime)
          }
        }
        cursorRef.current += 1
      }
      setTick(songTime)
      if (!overRef.current && songTime >= songMs) finish(true)
      if (!overRef.current) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [audio, chart, emit, paused])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const lane = KEY_LANES[event.code]
      if (lane === undefined || event.repeat) return
      // Paused: hand the key back to the host untouched instead of swallowing it.
      if (pausedRef.current) return
      event.preventDefault()
      engineRef.current(lane)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const Icon = CHAPTER_ICONS[spec.chapter - 1]
  const inSlow = chart.slowWindows.some((window) => tick >= window.start && tick < window.end)
  const inWarmup = spec.warmup && tick > 0 && tick < chart.warmupUntilMs
  const progress = Math.min(1, tick / chart.songMs)
  return (
    <div className={`rl-game ch${spec.chapter}${over ? ` is-${over}` : ''}${inSlow ? ' is-slow' : ''}`} aria-label="节奏轨道游戏区">
      <div className="rl-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {spec.bpm} BPM · {spec.bars} 小节</span>
        <strong>{capScore(score)} 分 · {combo} 连击{best > 4 ? ` (峰值 ${best})` : ''}</strong>
      </div>
      <div className="rl-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {inWarmup && <em className="is-teal">热身保护中</em>}
        {inSlow && <em className="is-gold">减速窗口</em>}
        {spec.doubles && <em className="is-coral">双押</em>}
      </div>
      <div className="rl-hp"><span style={{ transform: `scaleX(${hp / MAX_HP})` }} /><i>{Math.round(hp)}</i></div>
      <div className="rl-field">
        <div className="rl-lanes">
          {laneNotes.map((items, lane) => (
            <div key={lane} className={`rl-lane lane-${lane}`}>
              {items.map(({ note, index }) => {
                const offset = visualDistance(tick, note.time, chart.slowWindows, SLOW_SCALE) * PX_PER_MS * spec.speed
                const status = statuses[index] ?? 0
                return (
                  <span
                    key={index}
                    className={`rl-note ${NOTE_STATES[status]}${note.decoy && status === 0 ? ' is-decoy' : ''}${offset > HIDE_PX ? ' is-waiting' : ''}`}
                    style={{ transform: `translateY(${-Math.max(-84, offset)}px)` }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="rl-line" />
        {flash && <span key={flash.key} className={`rl-flash is-${flash.kind}`}>{flash.text}</span>}
        {paused && !over && <span className="rl-veil">已暂停</span>}
        {over && (
          <div className="rl-panel">
            <strong>{over === 'completed' ? '曲目完成' : '节奏中断'}</strong>
            <span>{over === 'completed' ? `血量 ${Math.round(hp)} · 连击峰值 ${best}` : `倒在 ${Math.round(progress * 100)}% 处 · 连击峰值 ${best}`}</span>
            <em>{capScore(score)} 分</em>
            <button onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={16} />再来一次</button>
          </div>
        )}
      </div>
      <div className="rl-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="rl-keys">
        {LANE_KEYS.map((key, lane) => (
          <button key={key} className={`rl-key lane-${lane}`} onPointerDown={(event) => { event.preventDefault(); engineRef.current(lane) }} aria-label={`击打 ${key} 轨道`}>{key}</button>
        ))}
      </div>
    </div>
  )
}

export default function RhythmLaneGame(props: GameModuleProps) {
  const levelKey = Math.min(RHYTHM_LEVEL_COUNT, Math.max(1, Math.floor(props.level ?? 1)))
  return <RhythmLaneRun key={levelKey} {...props} />
}
