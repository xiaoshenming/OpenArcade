import { useEffect, useMemo, useState } from 'react'
import { Eye, Repeat, RotateCcw, Shuffle, Sparkles, VolumeX } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { createDistractorPlan, createSequence, distractorAt, effectiveSequence, initialEchoState, isSilentRound, judgeInput, STAR_COUNT } from './logic'
import { getEchoLevel } from './levels'
import './echo-steps.css'

const STAR_GLYPHS = ['✦', '✧', '✶', '✷', '✸', '✹'] as const

function EchoSession({ paused, muted, emit, levelNumber }: { paused: boolean; muted: boolean; emit: (event: GameEvent) => void; levelNumber: number }) {
  const spec = useMemo(() => getEchoLevel(levelNumber), [levelNumber])
  const [sequence] = useState(() => createSequence(spec))
  const [echo, setEcho] = useState(initialEchoState)
  const [playhead, setPlayhead] = useState(-1)
  const [lit, setLit] = useState(-1)
  const [spark, setSpark] = useState(-1)
  const [pressed, setPressed] = useState(-1)
  const audio = useMemo(() => createGameAudio(), [])
  const effective = useMemo(() => effectiveSequence(sequence, spec.reverse), [sequence, spec.reverse])
  const plan = useMemo(() => createDistractorPlan(spec, echo.round, sequence), [spec, echo.round, sequence])
  const silent = isSilentRound(spec, echo.round)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (pressed < 0) return
    const timer = window.setTimeout(() => setPressed(-1), 240)
    return () => window.clearTimeout(timer)
  }, [pressed])

  useEffect(() => {
    if (paused || echo.phase !== 'playback') return
    if (playhead < 0) {
      const begin = window.setTimeout(() => setPlayhead(0), 420)
      return () => window.clearTimeout(begin)
    }
    if (playhead >= effective.length) {
      const finish = window.setTimeout(() => {
        setEcho((state) => (state.phase === 'playback' ? { ...state, phase: 'input' } : state))
        setPlayhead(-1)
      }, 280)
      return () => window.clearTimeout(finish)
    }
    const star = effective[playhead]
    const flash = window.setTimeout(() => {
      setLit(star)
      setSpark(distractorAt(plan, playhead))
      if (!silent) audio.play('step')
    }, 30)
    const off = window.setTimeout(() => { setLit(-1); setSpark(-1) }, Math.max(150, spec.stepMs * 0.58))
    const next = window.setTimeout(() => setPlayhead((value) => value + 1), spec.stepMs)
    return () => { window.clearTimeout(flash); window.clearTimeout(off); window.clearTimeout(next) }
  }, [audio, effective, echo.phase, paused, plan, playhead, silent, spec.stepMs])

  const tap = (star: number) => {
    if (paused || echo.phase !== 'input') return
    audio.play('select')
    setPressed(star)
    const result = judgeInput(spec, echo, sequence, star)
    setEcho(result.state)
    if (result.correct) {
      audio.play(result.completed ? 'win' : 'step')
      if (result.completed) emit({ type: 'completed', score: result.state.score })
      else emit({ type: 'score', score: result.state.score })
    } else {
      audio.play(result.failed ? 'lose' : 'mismatch')
      if (result.failed) emit({ type: 'failed', score: result.state.score })
      else emit({ type: 'score', score: result.state.score })
    }
  }

  const watching = echo.phase === 'playback'
  const StatusIcon = echo.phase === 'input' ? Eye : Sparkles
  const status = echo.phase === 'complete' ? '星轨完成'
    : echo.phase === 'failed' ? '星轨中断'
      : watching ? (silent ? '静默重播 · 只用眼睛' : '凝望星轨…')
        : `轮到你了 · 第 ${Math.min(echo.position + 1, spec.length)} / ${spec.length} 步`
  return (
    <div className={`echo-game mode-${spec.mode}`} aria-label="记忆星轨游戏区">
      <div className="echo-readout"><span>关卡 {String(levelNumber).padStart(2, '0')} · 第 {echo.round + 1} 轮</span><strong>{echo.steps}/{spec.length} 步 · {echo.score} 分</strong></div>
      <div className="echo-rule">
        <span><StatusIcon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.reverse && <em><Repeat size={11} />倒叙</em>}
        {silent && <em><VolumeX size={11} />静默</em>}
        {spec.distractors > 0 && <em><Shuffle size={11} />干扰 ×{spec.distractors}</em>}
        <i className="echo-lives" data-lives={echo.lives}>{'●'.repeat(echo.lives)}{'○'.repeat(spec.maxLives - echo.lives)}</i>
      </div>
      <div className={`echo-ring ${watching ? 'is-watching' : ''} ${echo.phase === 'failed' ? 'is-broken' : ''}`}>
        {Array.from({ length: STAR_COUNT }, (_, star) => (
          <button
            key={star}
            className={`echo-star ${lit === star ? 'is-lit' : ''} ${spark === star ? 'is-spark' : ''} ${pressed === star ? 'is-pressed' : ''}`}
            style={{ '--star-angle': `${star * (360 / STAR_COUNT)}deg` } as React.CSSProperties}
            onClick={() => tap(star)}
            disabled={watching || echo.phase === 'complete' || echo.phase === 'failed'}
            aria-label={`星传感器 ${star + 1}`}
          ><span>{STAR_GLYPHS[star]}</span></button>
        ))}
        <div className="echo-core"><StatusIcon size={17} /><small>{echo.phase === 'input' ? `${echo.position + 1}` : `${spec.chapter}`}</small></div>
      </div>
      <p className="echo-status">{status}{spec.reverse && echo.phase === 'input' ? ' · 反着点' : ''}</p>
      <button className="echo-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}

export default function EchoStepsGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  return <EchoSession key={levelNumber} paused={paused} muted={muted} emit={emit} levelNumber={levelNumber} />
}
