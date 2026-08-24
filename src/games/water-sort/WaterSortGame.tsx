import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { isSolved, pour, type Board } from './logic'
import { createWaterBoard, WATER_LEVELS } from './levels'
import './water-sort.css'

const colors = ['#ef5f78', '#18a999', '#f2b84b', '#6687e8', '#a970d4', '#f18f4c']

export default function WaterSortGame({ paused, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(WATER_LEVELS.length, Math.max(1, level))
  const levelData = WATER_LEVELS[levelNumber - 1]
  const [board, setBoard] = useState<Board>(() => createWaterBoard(levelNumber))
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Board[]>([])
  const [moves, setMoves] = useState(0)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const completed = useMemo(() => isSolved(board), [board])
  useEffect(() => {
    if (completed && moves > 0) {
      const score = Math.max(100, 1000 - Math.max(0, moves - levelData.par) * 35)
      emit({ type: 'completed', score })
    }
  }, [completed, emit, levelData.par, moves])

  const chooseTube = (index: number) => {
    if (paused || completed) return
    if (selected === null) {
      if (board[index].length) setSelected(index)
      return
    }
    if (selected === index) {
      setSelected(null)
      return
    }
    const result = pour(board, selected, index)
    if (result.moved) {
      setHistory((items) => [...items, board])
      setBoard(result.board)
      setMoves((value) => value + 1)
      emit({ type: 'score', score: Math.max(100, 1000 - Math.max(0, moves + 1 - levelData.par) * 35) })
    }
    setSelected(null)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous || paused) return
    setBoard(previous)
    setHistory((items) => items.slice(0, -1))
    setMoves((value) => Math.max(0, value - 1))
    setSelected(null)
  }

  return (
    <div className="water-game" aria-label="琉璃分色游戏区">
      <div className="game-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {levelData.par} 步</span>
        <strong>{moves.toString().padStart(2, '0')} 步</strong>
      </div>
      <div className="tube-board" style={{ '--tube-count': board.length } as React.CSSProperties}>
        {board.map((tube, tubeIndex) => (
          <button
            className={`tube ${selected === tubeIndex ? 'is-selected' : ''}`}
            key={tubeIndex}
            onClick={() => chooseTube(tubeIndex)}
            aria-label={`试管 ${tubeIndex + 1}，${tube.length} 层液体`}
            aria-pressed={selected === tubeIndex}
          >
            <span className="tube-glass">
              {tube.map((color, layer) => (
                <span className="liquid-layer" key={`${color}-${layer}`} style={{ backgroundColor: colors[color], bottom: `calc(${layer} * 23%)` }} />
              ))}
              <span className="glass-shine" />
            </span>
          </button>
        ))}
      </div>
      <div className="game-actions">
        <button className="game-icon-button" onClick={undo} disabled={!history.length || paused} title="撤销上一步"><Undo2 size={18} /><span>撤销</span></button>
        <button className="game-icon-button" onClick={() => emit({ type: 'request-restart' })} title="重新开始"><RotateCcw size={18} /><span>重开</span></button>
      </div>
    </div>
  )
}
