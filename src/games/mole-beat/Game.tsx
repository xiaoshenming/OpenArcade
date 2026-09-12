import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import { HOLES, createMoleState, isUp, multiplierOf, step, whack, type MoleSpawn, type MoleState } from './logic'
import { getMoleLevel, LEVEL_COUNT, type MoleLevel } from './levels'
import './mole-beat.css'

interface RunProps { plan: MoleLevel; paused: boolean; emit: (event: GameEvent) => void; audio: GameAudio; onRestart: () => void }

interface Hud { score: number; seconds: number; hits: number; quota: number; misses: number; multiplier: number; stunned: boolean; status: MoleState['status']; final: number }

const readHud = (state: MoleState): Hud => ({
  score: state.score,
  seconds: Math.max(0, Math.ceil(state.duration - state.time)),
  hits: state.hits,
  quota: state.quota,
  misses: state.misses,
  multiplier: multiplierOf(state.streak, state.comboRule),
  stunned: state.stun > 0,
  status: state.status,
  final: 0,
})

const sameHud = (a: Hud, b: Hud) => a.score === b.score && a.seconds === b.seconds && a.hits === b.hits && a.misses === b.misses && a.multiplier === b.multiplier && a.stunned === b.stunned && a.status === b.status

const visibleMoles = (state: MoleState) => state.queue.filter((spawn) => isUp(spawn, state.time) && !state.whacked.includes(spawn.id))
const sigOf = (spawns: MoleSpawn[]) => spawns.map((spawn) => spawn.id).join(',')

export default function MoleBeatGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const plan = useMemo(() => getMoleLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <MoleRun key={`${levelNumber}-${epoch}`} plan={plan} paused={paused} emit={emit} audio={audio} onRestart={() => setEpoch((value) => value + 1)} />
}

function MoleRun({ plan, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const initial = useMemo(() => createMoleState(plan), [plan])
  const stateRef = useRef(initial)
  const [hud, setHud] = useState<Hud>(() => readHud(initial))
  const hudRef = useRef(hud)
  const [visible, setVisible] = useState<MoleSpawn[]>([])
  const [pops, setPops] = useState<number[]>([])
  const sigRef = useRef('')
  const doneRef = useRef(false)
  const reduceMotion = useMemo(() => prefersReducedMotion(), [])

  useEffect(() => {
    if (!pops.length) return
    const timer = window.setTimeout(() => setPops([]), 260)
    return () => window.clearTimeout(timer)
  }, [pops])

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
    let risen = new Set<number>()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const next = step(stateRef.current, dt)
      stateRef.current = next
      if (next.status !== 'playing') {
        sigRef.current = ''
        setVisible([])
        finish(false, next.score)
        return
      }
      const up = visibleMoles(next)
      const ids = new Set(up.map((spawn) => spawn.id))
      let fresh = false
      ids.forEach((id) => { if (!risen.has(id)) fresh = true })
      if (fresh) audio.play('step')
      risen = ids
      const sig = sigOf(up)
      if (sig !== sigRef.current) {
        sigRef.current = sig
        setVisible(up)
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
  }, [audio, finish, paused])

  const strike = (hole: number) => {
    if (pausedRef.current || doneRef.current) return
    const result = whack(stateRef.current, hole)
    stateRef.current = result.state
    if (result.event === 'empty' || result.event === 'stun') {
      audio.play('select')
      return
    }
    audio.play(result.event === 'bomb' ? 'mismatch' : 'match')
    const up = visibleMoles(result.state)
    sigRef.current = sigOf(up)
    setVisible(up)
    if (!reduceMotion) setPops((items) => (items.includes(hole) ? items : [...items, hole]))
    emit({ type: 'score', score: result.state.score })
    const snapshot = readHud(result.state)
    hudRef.current = snapshot
    setHud(snapshot)
    if (result.state.status === 'cleared') finish(true, result.state.score)
  }

  const byHole = new Map<number, MoleSpawn>()
  visible.forEach((spawn) => byHole.set(spawn.hole, spawn))
  const ended = hud.status !== 'playing'
  return (
    <div className={`mb-game chapter-${plan.chapter}`} aria-label="地鼠节拍游戏区">
      <div className="mb-readout">
        <span>关卡 {String(plan.level).padStart(2, '0')} · {plan.title}</span>
        <strong>{hud.score} 分</strong>
      </div>
      <div className="mb-rule">
        <span>{plan.detail}</span>
        <em className="is-quota">命中 {hud.hits}/{hud.quota}</em>
        <em className="is-miss">逃 {hud.misses}</em>
        {plan.combo && <em className="is-combo">连击 ×{hud.multiplier}</em>}
        {hud.stunned && <em className="is-stun">眩晕</em>}
        <em className="is-time">{hud.seconds}s</em>
      </div>
      <div className="mb-stage">
        <div className="mb-board">
          {Array.from({ length: HOLES }, (_, hole) => {
            const spawn = byHole.get(hole)
            return (
              <button
                key={hole}
                type="button"
                className={`mb-hole ${spawn ? 'is-occupied' : ''} ${pops.includes(hole) ? 'is-pop' : ''}`}
                onPointerDown={(event) => { event.preventDefault(); strike(hole) }}
                aria-label={spawn ? `${hole + 1} 号洞有${spawn.kind === 'bomb' ? '炸弹鼠' : spawn.kind === 'gold' ? '金鼠' : '地鼠'}` : `敲击 ${hole + 1} 号洞`}
              >
                <span className="mb-dirt" />
                {spawn && <span className={`mb-mole is-${spawn.kind}`}>{spawn.kind === 'bomb' ? '✸' : spawn.kind === 'gold' ? '★' : '♪'}</span>}
              </button>
            )
          })}
        </div>
        {ended && (
          <div className="mb-stamp">
            <span>{hud.status === 'cleared' ? '节拍达成' : '时间到'}</span>
            <strong>{hud.final} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="mb-actions">
        <button type="button" className="mb-restart" onClick={onRestart} disabled={ended}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
