import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, Lightbulb, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { advanceSolution, isSolved, pour, solutionStep, type Board } from './logic'
import { createWaterBoard, WATER_LEVELS } from './levels'
import { getWaterRule } from './rules'
import './water-sort.css'

const colors = ['#ef5f78', '#18a999', '#f2b84b', '#6687e8', '#a970d4', '#f18f4c']
const scoreFor = (moves: number, par: number) => Math.max(100, 1000 - Math.max(0, moves - par) * 35)

export default function WaterSortGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(WATER_LEVELS.length, Math.max(1, level))
  const levelData = WATER_LEVELS[levelNumber - 1]
  const rule = getWaterRule(levelNumber, levelData)
  const audio = useMemo(() => createGameAudio(), [])
  const hintTimer = useRef<number | null>(null)
  const [board, setBoard] = useState<Board>(() => createWaterBoard(levelNumber))
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Board[]>([])
  const [moves, setMoves] = useState(0)
  const [failed, setFailed] = useState(false)
  const [solutionProgress, setSolutionProgress] = useState(0)
  const [diverged, setDiverged] = useState(false)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [hint, setHint] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])
  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
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

  const chooseTube = (index: number) => {
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
    const result = pour(board, selected, index)
    if (result.moved) {
      const nextMoves = moves + 1
      setHistory((items) => [...items, board])
      setBoard(result.board)
      setMoves(nextMoves)
      audio.play('step')
      if (!diverged) {
        const next = advanceSolution(levelData.solution, solutionProgress, selected, index)
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
    setSelected(null)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous || paused || rule.noUndo || failed) return
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

  return (
    <div className={`water-game mode-${rule.mode}`} aria-label="琉璃分色游戏区">
      <div className="game-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {levelData.par} 步</span>
        <strong>{moves.toString().padStart(2, '0')}{rule.moveLimit ? ` / ${rule.moveLimit}` : ''} 步</strong>
      </div>
      <div className="water-rule"><span>{rule.hiddenLayers ? <EyeOff size={14} /> : rule.lockTube !== undefined ? <LockKeyhole size={14} /> : null}{rule.title}</span><small>{rule.detail}</small></div>
      <div className="tube-board">
        {board.map((tube, tubeIndex) => {
          const locked = rule.lockTube === tubeIndex && moves < (rule.unlockMoves ?? 0)
          const legal = selected !== null && selected !== tubeIndex && pour(board, selected, tubeIndex).moved > 0
          const hinted = hint !== null && (hint.from === tubeIndex || hint.to === tubeIndex)
          return (
            <button className={`tube ${selected === tubeIndex ? 'is-selected' : ''} ${legal && rule.guided ? 'is-legal' : ''} ${locked ? 'is-locked' : ''} ${hinted ? 'is-hinted' : ''}`} key={tubeIndex} onClick={() => chooseTube(tubeIndex)} disabled={locked} aria-label={`试管 ${tubeIndex + 1}，${locked ? '尚未解锁' : tube.length + ' 层液体'}`} aria-pressed={selected === tubeIndex}>
              <span className="tube-glass">
                {tube.map((color, layer) => {
                  const hidden = rule.hiddenLayers && layer < tube.length - 1
                  return <span className={`liquid-layer ${hidden ? 'is-hidden' : ''}`} key={`${color}-${layer}`} style={{ backgroundColor: hidden ? '#aeb8c4' : colors[color], bottom: `calc(${layer} * 23%)` }} />
                })}
                <span className="glass-shine" />
              </span>
              {locked && <span className="tube-lock"><LockKeyhole size={15} />{(rule.unlockMoves ?? 0) - moves}</span>}
            </button>
          )
        })}
      </div>
      <div className="game-actions">
        <button className="game-icon-button" onClick={undo} disabled={!history.length || paused || rule.noUndo || failed} title={rule.noUndo ? '本关禁止撤销' : '撤销上一步'}><Undo2 size={18} /><span>{rule.noUndo ? '禁用撤销' : '撤销'}</span></button>
        <button className="game-icon-button" onClick={() => emit({ type: 'request-restart' })} title="重新开始"><RotateCcw size={18} /><span>重开</span></button>
        <button className="game-icon-button game-hint" onClick={showHint} disabled={hintDisabled} title={hintTitle}><Lightbulb size={18} /><span>提示 ×{hintsLeft}</span></button>
      </div>
    </div>
  )
}
