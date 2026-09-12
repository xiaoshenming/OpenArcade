import { useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Play, RotateCcw, Scissors } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { FOLD_LABELS, isTimedOut, type FoldAxis } from './logic'
import { FOLD_LEVELS, getFoldLevel } from './levels'
import './fold-craft.css'

const scoreFor = (wrong: number, elapsed: number, par: number) => Math.max(100, 1000 - wrong * 80 - Math.max(0, elapsed - par) * 10)

interface Flap { left: number; top: number; width: number; height: number; axis: FoldAxis; delay: number }

export default function FoldCraftGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(FOLD_LEVELS, Math.max(1, Math.floor(level) || 1))
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <FoldSession key={levelNumber} levelNumber={levelNumber} paused={paused} audio={audio} emit={emit} />
}

function FoldSession({ levelNumber, paused, audio, emit }: { levelNumber: number; paused: boolean; audio: GameAudio; emit: (event: GameEvent) => void }) {
  const spec = useMemo(() => getFoldLevel(levelNumber), [levelNumber])
  const [marks, setMarks] = useState<number[]>([])
  const [lives, setLives] = useState(3)
  const [wrong, setWrong] = useState<number[]>([])
  const [missing, setMissing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<'won' | 'lost' | 'timed' | null>(null)
  const [demoRun, setDemoRun] = useState(1)
  const elapsedRef = useRef(0)
  // 错误总数只参与计分，不进渲染：放 ref 里，计时 interval 只建一次，不会因报错而秒内重建。
  const wrongTotalRef = useRef(0)

  useEffect(() => {
    if (paused || done) return
    const timer = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
      if (!isTimedOut(spec.timed, elapsedRef.current, spec.par)) return
      audio.play('lose')
      setDone('timed')
      emit({ type: 'failed', score: scoreFor(wrongTotalRef.current, elapsedRef.current, spec.par) })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [audio, done, emit, paused, spec.par, spec.timed])

  const flaps = useMemo(() => {
    const plan: Flap[] = []
    let rect = { left: 0, top: 0, width: 100, height: 100 }
    spec.folds.forEach((axis, index) => {
      const vertical = axis === 'left' || axis === 'right'
      const half = (vertical ? rect.width : rect.height) / 2
      const flap = axis === 'left' ? { ...rect, width: half } : axis === 'right' ? { ...rect, left: rect.left + half, width: half } : axis === 'up' ? { ...rect, height: half } : { ...rect, top: rect.top + half, height: half }
      plan.push({ ...flap, axis, delay: index * 700 })
      if (axis === 'left') rect = { ...rect, left: rect.left + half, width: half }
      else if (axis === 'right') rect = { ...rect, width: half }
      else if (axis === 'up') rect = { ...rect, top: rect.top + half, height: half }
      else rect = { ...rect, height: half }
    })
    return plan
  }, [spec])

  const toggle = (cell: number) => {
    if (paused || done) return
    audio.play('select')
    setWrong([])
    setMissing(false)
    setMarks((current) => (current.includes(cell) ? current.filter((item) => item !== cell) : [...current, cell].sort((a, b) => a - b)))
    emit({ type: 'score', score: scoreFor(wrongTotalRef.current, elapsed, spec.par) })
  }

  const submit = () => {
    if (paused || done) return
    const bad = marks.filter((cell) => !spec.answer.includes(cell))
    if (!bad.length && marks.length === spec.answer.length) {
      audio.play('win')
      setDone('won')
      emit({ type: 'completed', score: scoreFor(wrongTotalRef.current, elapsed, spec.par) })
      return
    }
    if (!bad.length) {
      audio.play('mismatch')
      setMissing(true)
      return
    }
    const remaining = lives - bad.length
    wrongTotalRef.current += bad.length
    setWrong(bad)
    setLives(Math.max(0, remaining))
    emit({ type: 'score', score: scoreFor(wrongTotalRef.current, elapsed, spec.par) })
    if (remaining <= 0) {
      audio.play('lose')
      setDone('lost')
      emit({ type: 'failed', score: scoreFor(wrongTotalRef.current, elapsed, spec.par) })
    } else audio.play('mismatch')
  }

  const urgent = spec.timed && !done && spec.par - elapsed <= 5
  const cells = Array.from({ length: spec.rows * spec.cols }, (_, cell) => cell)
  const miniCells = Array.from({ length: spec.folded.rows * spec.folded.cols }, (_, cell) => cell)
  return (
    <div className={`fold-game ${paused ? 'is-paused' : ''}`} aria-label="折纸工坊游戏区">
      <div className="fold-readout">
        <span className={urgent ? 'is-urgent' : ''}>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 · {elapsed}s / {spec.par}s</span>
        <strong>{[0, 1, 2].map((heart) => <Heart key={heart} size={14} className={heart < lives ? 'heart-on' : 'heart-off'} />)}</strong>
      </div>
      <div className="fold-rule">
        <span><Scissors size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.mirror && <em>镜像双孔</em>}
        {spec.timed && <em>硬超时</em>}
      </div>
      <div className="fold-stage">
        <div className="fold-board" style={{ '--fold-cols': spec.cols } as React.CSSProperties}>
          {cells.map((cell) => {
            const marked = marks.includes(cell)
            const bad = wrong.includes(cell)
            const revealed = done === 'won' && spec.answer.includes(cell)
            return (
              <button key={cell} type="button" className={`fold-paper ${marked ? 'is-marked' : ''}`} onClick={() => toggle(cell)} aria-pressed={marked} aria-label={`原纸第 ${Math.floor(cell / spec.cols) + 1} 行第 ${(cell % spec.cols) + 1} 列${marked ? '，已标记' : ''}`}>
                {marked && <i className={`fold-hole ${bad ? 'is-wrong' : ''}`} />}
                {revealed && <i className="fold-hole is-reveal" style={{ '--reveal-delay': `${spec.answer.indexOf(cell) * 55}ms` } as React.CSSProperties} />}
              </button>
            )
          })}
          {flaps.map((flap, index) => (
            <span key={`${demoRun}-${index}`} className={`fold-flap flap-${flap.axis}`} style={{ left: `${flap.left}%`, top: `${flap.top}%`, width: `${flap.width}%`, height: `${flap.height}%`, animationDelay: `${flap.delay}ms` }} />
          ))}
        </div>
        <div className="fold-side">
          <div className="fold-mini" style={{ '--fold-cols': spec.folded.cols } as React.CSSProperties}>
            {miniCells.map((cell) => (
              <span key={cell} className={`fold-slot ${spec.holes.includes(cell) ? 'is-punched' : ''}`}>{spec.holes.includes(cell) && <i className="fold-pin" />}</span>
            ))}
          </div>
          <div className="fold-chips">{spec.folds.map((axis, index) => <em key={index}>{index + 1}. {FOLD_LABELS[axis]}</em>)}</div>
          <button className="fold-button" type="button" onClick={() => setDemoRun((value) => value + 1)}><Play size={15} />重看折叠</button>
        </div>
      </div>
      <div className="fold-actions">
        <button className="fold-button is-primary" type="button" onClick={submit} disabled={Boolean(done)}><Scissors size={15} />穿孔验证</button>
        <button className="fold-button" type="button" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={15} />重开本关</button>
      </div>
      {missing && !done && <div className="fold-banner is-warn">还有孔位遗漏，再找找</div>}
      {done && <div className={`fold-banner ${done === 'won' ? 'is-win' : 'is-lose'}`}>{done === 'won' ? '展开验证 · 孔位全部命中' : done === 'timed' ? '时限已至 · 纸张泛黄作废' : '纸张破损 · 三心用尽'}</div>}
    </div>
  )
}
