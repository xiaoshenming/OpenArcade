import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { LEVEL, isSolved, pour, type Board } from './logic'
import './water-sort.css'

const colorMap: Record<string, string> = {
  coral: '#ef476f',
  teal: '#06a6a6',
  gold: '#ffb000',
}

function cloneLevel(): Board {
  return LEVEL.map((tube) => [...tube])
}

export default function WaterSortGame({ paused, emit }: GameModuleProps) {
  const [board, setBoard] = useState<Board>(cloneLevel)
  const [selected, setSelected] = useState<number | null>(null)
  const [history, setHistory] = useState<Board[]>([])
  const [moves, setMoves] = useState(0)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const completed = useMemo(() => isSolved(board), [board])
  useEffect(() => {
    if (completed && moves > 0) emit({ type: 'completed', score: Math.max(100, 1000 - moves * 25) })
  }, [completed, emit, moves])

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
      emit({ type: 'score', score: Math.max(0, 1000 - (moves + 1) * 25) })
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
        <span>第 01 关</span>
        <strong>{moves.toString().padStart(2, '0')} 步</strong>
      </div>
      <div className="tube-board">
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
                <span
                  className="liquid-layer"
                  key={`${color}-${layer}`}
                  style={{ backgroundColor: colorMap[color], bottom: `calc(${layer} * 23%)` }}
                />
              ))}
              <span className="glass-shine" />
            </span>
          </button>
        ))}
      </div>
      <div className="game-actions">
        <button className="game-icon-button" onClick={undo} disabled={!history.length || paused} title="撤销上一步">
          <Undo2 size={18} />
          <span>撤销</span>
        </button>
        <button className="game-icon-button" onClick={() => emit({ type: 'request-restart' })} title="重新开始">
          <RotateCcw size={18} />
          <span>重开</span>
        </button>
      </div>
      {completed && (
        <div className="win-stamp" role="status">
          <span>PERFECT SORT</span>
          <strong>分类完成</strong>
        </div>
      )}
    </div>
  )
}
