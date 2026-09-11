import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, Lightbulb, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { tween, prefersReducedMotion } from '../../platform/motion'
import { advanceSolution, isSolved, pour, solutionStep, type Board } from './logic'
import { createWaterBoard, WATER_LEVELS } from './levels'
import { getWaterRule } from './rules'
import './water-sort.css'

const colors = ['#ef5f78', '#18a999', '#f2b84b', '#6687e8', '#a970d4', '#f18f4c']
const scoreFor = (moves: number, par: number) => Math.max(100, 1000 - Math.max(0, moves - par) * 35)
const pourTilt = 26
const flightMs = 480
const flightRise = 24
const flightArcLift = 30
const streamMs = 140
const streamDelay = flightMs - streamMs

interface FlightGeometry {
  flight: { left: number; top: number; width: number; height: number; rise: number; arc: [number, number]; hover: [number, number]; drop: [number, number] }
  stream: { left: number; top: number; height: number }
}

interface PourFlight {
  from: number
  to: number
  tilt: number
  color: number
  units: number
  geometry: FlightGeometry
  commit: () => void
}

export default function WaterSortGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(WATER_LEVELS.length, Math.max(1, level))
  const levelData = WATER_LEVELS[levelNumber - 1]
  const rule = getWaterRule(levelNumber, levelData)
  const audio = useMemo(() => createGameAudio(), [])
  const hintTimer = useRef<number | null>(null)
  const landingTimer = useRef<number | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const tubeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const flightRef = useRef<HTMLSpanElement | null>(null)
  const streamRef = useRef<HTMLSpanElement | null>(null)
  const [board, setBoard] = useState<Board>(() => createWaterBoard(levelNumber))
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Board[]>([])
  const [moves, setMoves] = useState(0)
  const [failed, setFailed] = useState(false)
  const [solutionProgress, setSolutionProgress] = useState(0)
  const [diverged, setDiverged] = useState(false)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null)
  const [flight, setFlight] = useState<PourFlight | null>(null)
  const [landing, setLanding] = useState<{ to: number; units: number } | null>(null)

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])
  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    if (landingTimer.current !== null) window.clearTimeout(landingTimer.current)
  }, [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const completed = useMemo(() => isSolved(board), [board])
  useEffect(() => {
    if (completed && moves > 0) {
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(moves, levelData.par) })
    }
  }, [audio, completed, emit, levelData.par, moves])

  const measurePour = (from: number, to: number, units: number, targetLayers: number): FlightGeometry | null => {
    const boardEl = boardRef.current
    const fromGlass = tubeRefs.current[from]?.querySelector('.tube-glass')
    const toGlass = tubeRefs.current[to]?.querySelector('.tube-glass')
    if (!boardEl || !(fromGlass instanceof HTMLElement) || !(toGlass instanceof HTMLElement)) return null
    const boardRect = boardEl.getBoundingClientRect()
    const fromRect = fromGlass.getBoundingClientRect()
    const toRect = toGlass.getBoundingClientRect()
    const width = Math.max(18, toRect.width - 4)
    const unit = (toRect.height - 4) * 0.23
    const height = units * unit
    const depth = targetLayers * unit
    const left = fromRect.left + fromRect.width / 2 - width / 2 - boardRect.left
    const top = fromRect.top - height - boardRect.top
    const hoverX = toRect.left + toRect.width / 2 - width / 2 - boardRect.left - left
    const hoverY = toRect.top - 8 - height - boardRect.top - top
    const dropY = toRect.bottom - 2 - depth - height - boardRect.top - top
    return {
      flight: { left, top, width, height, rise: -flightRise, arc: [hoverX / 2, (hoverY - flightRise) / 2 - flightArcLift], hover: [hoverX, hoverY], drop: [hoverX, dropY] },
      stream: { left: toRect.left + toRect.width / 2 - boardRect.left - 2.5, top: toRect.top - boardRect.top + 2, height: Math.max(10, toRect.bottom - 2 - depth - toRect.top - 2) },
    }
  }

  const chooseTube = (index: number) => {
    if (flight) return
    const locked = rule.lockTube === index && moves < (rule.unlockMoves ?? 0)
    if (paused || completed || failed || locked) return
    if (selected === null) {
      if (board[index].length) {
        setSelected(index)
        audio.play('select')
      }
      return
    }
    if (selected === index) { setSelected(null); return }
    const from = selected
    const result = pour(board, from, index)
    setSelected(null)
    if (!result.moved) return
    const commit = () => {
      const nextMoves = moves + 1
      setHistory((items) => [...items, board])
      setBoard(result.board)
      setMoves(nextMoves)
      audio.play('step')
      if (!prefersReducedMotion()) {
        setLanding({ to: index, units: result.moved })
        if (landingTimer.current !== null) window.clearTimeout(landingTimer.current)
        landingTimer.current = window.setTimeout(() => setLanding(null), 240)
      }
      if (!diverged) {
        const next = advanceSolution(levelData.solution, solutionProgress, from, index)
        setSolutionProgress(next.progress)
        if (next.diverged) setDiverged(true)
      }
      emit({ type: 'score', score: scoreFor(nextMoves, levelData.par) })
      if (rule.moveLimit && nextMoves >= rule.moveLimit && !isSolved(result.board)) {
        setFailed(true)
        audio.play('lose')
        emit({ type: 'failed', score: scoreFor(nextMoves, levelData.par) })
      }
    }
    const geometry = prefersReducedMotion() ? null : measurePour(from, index, result.moved, board[index].length)
    if (!geometry) { commit(); return }
    setFlight({ from, to: index, tilt: index > from ? pourTilt : -pourTilt, color: board[from][board[from].length - 1], units: result.moved, geometry, commit })
  }

  useEffect(() => {
    if (!flight) return
    let cancelled = false
    const { geometry, tilt } = flight
    const tweens = [
      flightRef.current ? tween(flightRef.current, [
        { transform: 'translate(0px, 0px) rotate(0deg)' },
        { transform: `translate(0px, ${geometry.flight.rise}px) rotate(${tilt}deg)`, offset: 140 / flightMs },
        { transform: `translate(${geometry.flight.arc[0]}px, ${geometry.flight.arc[1]}px) rotate(${tilt / 2}deg)`, offset: 240 / flightMs },
        { transform: `translate(${geometry.flight.hover[0]}px, ${geometry.flight.hover[1]}px) rotate(0deg)`, offset: 340 / flightMs },
        { transform: `translate(${geometry.flight.drop[0]}px, ${geometry.flight.drop[1]}px) rotate(0deg)` },
      ], { duration: flightMs, easing: 'standard' }) : Promise.resolve(),
      streamRef.current ? tween(streamRef.current, [
        { transform: 'scaleY(0)' },
        { transform: 'scaleY(1)', offset: 0.5 },
        { transform: 'scaleY(0)' },
      ], { duration: streamMs, delay: streamDelay, easing: 'standard' }) : Promise.resolve(),
    ]
    let committed = false
    const finish = () => {
      if (cancelled || committed) return
      committed = true
      flight.commit()
      setFlight(null)
    }
    const fallback = window.setTimeout(finish, flightMs + streamDelay + streamMs + 240)
    void Promise.all(tweens).then(() => {
      window.clearTimeout(fallback)
      finish()
    })
    return () => { cancelled = true; window.clearTimeout(fallback) }
  }, [flight])

  const undo = () => {
    const previous = history.at(-1)
    if (!previous || paused || rule.noUndo || failed || flight) return
    if (landingTimer.current !== null) { window.clearTimeout(landingTimer.current); landingTimer.current = null }
    setLanding(null)
    setBoard(previous)
    setHistory((items) => items.slice(0, -1))
    setMoves((value) => Math.max(0, value - 1))
    if (!diverged && solutionProgress > 0) setSolutionProgress((value) => value - 1)
    setSelected(null)
  }

  const showHint = () => {
    if (diverged || !hintsLeft || completed || paused) return
    const step = solutionStep(levelData.solution, solutionProgress)
    if (!step) return
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 1800)
    setHint(step)
    setHintsLeft((value) => value - 1)
  }

  const hintDisabled = diverged || !hintsLeft || completed || paused
  const hintTitle = diverged ? '已偏离参考路线' : !hintsLeft ? '提示已用完' : '高亮参考路线的下一步'
  const flightColor = flight ? (rule.hiddenLayers ? '#aeb8c4' : colors[flight.color]) : ''

  return (
    <div className={`water-game mode-${rule.mode}`} aria-label="琉璃分色游戏区">
      <div className="game-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {levelData.par} 步</span>
        <strong>{moves.toString().padStart(2, '0')}{rule.moveLimit ? ` / ${rule.moveLimit}` : ''} 步</strong>
      </div>
      <div className="water-rule"><span>{rule.hiddenLayers ? <EyeOff size={14} /> : rule.lockTube !== undefined ? <LockKeyhole size={14} /> : null}{rule.title}</span><small>{rule.detail}</small></div>
      <div className="tube-board" ref={boardRef}>
        {board.map((tube, tubeIndex) => {
          const locked = rule.lockTube === tubeIndex && moves < (rule.unlockMoves ?? 0)
          const legal = selected !== null && selected !== tubeIndex && pour(board, selected, tubeIndex).moved > 0
          const hinted = hint !== null && (hint.from === tubeIndex || hint.to === tubeIndex)
          const pourClass = flight && flight.from === tubeIndex ? (flight.tilt > 0 ? ' is-pouring pour-right' : ' is-pouring pour-left') : ''
          const landingFrom = landing && landing.to === tubeIndex ? tube.length - landing.units : tube.length
          return (
            <button className={`tube ${selected === tubeIndex ? 'is-selected' : ''} ${legal && rule.guided ? 'is-legal' : ''} ${locked ? 'is-locked' : ''} ${hinted ? 'is-hinted' : ''}${pourClass}`} key={tubeIndex} ref={(el) => { tubeRefs.current[tubeIndex] = el }} onClick={() => chooseTube(tubeIndex)} disabled={locked} aria-label={`试管 ${tubeIndex + 1}，${locked ? '尚未解锁' : tube.length + ' 层液体'}`} aria-pressed={selected === tubeIndex}>
              <span className="tube-glass">
                {tube.map((color, layer) => {
                  const hidden = rule.hiddenLayers && layer < tube.length - 1
                  const flyingAway = flight !== null && flight.from === tubeIndex && layer >= tube.length - flight.units
                  return <span className={`liquid-layer ${hidden ? 'is-hidden' : ''} ${flyingAway ? 'is-flying-away' : ''} ${layer >= landingFrom ? 'is-landing' : ''}`} key={`${color}-${layer}`} style={{ backgroundColor: hidden ? '#aeb8c4' : colors[color], bottom: `calc(${layer} * 23%)` }} />
                })}
                <span className="glass-shine" />
              </span>
              {locked && <span className="tube-lock"><LockKeyhole size={15} />{(rule.unlockMoves ?? 0) - moves}</span>}
            </button>
          )
        })}
        {flight && (
          <>
            <span className="pour-stream" ref={streamRef} style={{ left: flight.geometry.stream.left, top: flight.geometry.stream.top, height: flight.geometry.stream.height, backgroundColor: flightColor }} />
            <span className={`pour-flight ${rule.hiddenLayers ? 'is-veiled' : ''}`} ref={flightRef} style={{ left: flight.geometry.flight.left, top: flight.geometry.flight.top, width: flight.geometry.flight.width, height: flight.geometry.flight.height, backgroundColor: flightColor }} />
          </>
        )}
      </div>
      <div className="game-actions">
        <button className="game-icon-button" onClick={undo} disabled={!history.length || paused || rule.noUndo || failed} title={rule.noUndo ? '本关禁止撤销' : '撤销上一步'}><Undo2 size={18} /><span>{rule.noUndo ? '禁用撤销' : '撤销'}</span></button>
        <button className="game-icon-button" onClick={() => emit({ type: 'request-restart' })} title="重新开始"><RotateCcw size={18} /><span>重开</span></button>
        <button className="game-icon-button game-hint" onClick={showHint} disabled={hintDisabled} title={hintTitle}><Lightbulb size={18} /><span>提示 ×{hintsLeft}</span></button>
      </div>
    </div>
  )
}
