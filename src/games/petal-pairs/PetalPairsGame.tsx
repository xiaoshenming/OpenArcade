import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createPairDeck, getPairLevel } from './logic'
import './petal-pairs.css'

export default function PetalPairsGame({ paused, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(40, Math.max(1, level))
  const spec = getPairLevel(levelNumber)
  const deck = useMemo(() => createPairDeck(levelNumber), [levelNumber])
  const [previewing, setPreviewing] = useState(true)
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<number[]>([])
  const [moves, setMoves] = useState(0)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (paused || !previewing) return
    const timer = window.setTimeout(() => setPreviewing(false), spec.previewMs)
    return () => window.clearTimeout(timer)
  }, [paused, previewing, spec.previewMs])

  useEffect(() => {
    if (paused || flipped.length !== 2) return
    const [first, second] = flipped
    const isPair = deck[first] === deck[second]
    const timer = window.setTimeout(() => {
      if (isPair) {
        setMatched((items) => [...items, first, second])
        emit({ type: 'score', score: Math.max(100, 5000 - moves * 80) })
      }
      setFlipped([])
    }, isPair ? 260 : spec.mismatchMs)
    return () => window.clearTimeout(timer)
  }, [deck, emit, flipped, moves, paused, spec.mismatchMs])

  useEffect(() => {
    if (moves > 0 && matched.length === deck.length) emit({ type: 'completed', score: Math.max(100, 5000 - moves * 80) })
  }, [deck.length, emit, matched.length, moves])

  const flip = (index: number) => {
    if (paused || previewing || flipped.length >= 2 || flipped.includes(index) || matched.includes(index)) return
    setFlipped((items) => [...items, index])
    if (flipped.length === 1) setMoves((value) => value + 1)
  }

  return (
    <div className="pairs-game" aria-label="花笺成双游戏区">
      <div className="pairs-readout"><span>关卡 {String(levelNumber).padStart(2, '0')}</span><strong>{matched.length / 2} / {deck.length / 2} 对 · {moves} 次</strong></div>
      <div className="pairs-board" style={{ '--pair-columns': spec.columns } as React.CSSProperties}>
        {deck.map((symbol, index) => {
          const revealed = previewing || flipped.includes(index) || matched.includes(index)
          return (
            <button key={index} className={`pair-card ${revealed ? 'is-revealed' : ''} ${matched.includes(index) ? 'is-matched' : ''}`} onClick={() => flip(index)} aria-label={revealed ? `卡片 ${index + 1}：${symbol}` : `翻开卡片 ${index + 1}`}>
              <span>{symbol}</span>
            </button>
          )
        })}
      </div>
      <button className="pairs-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
      {previewing && <div className="pairs-preview">记住它们的位置</div>}
    </div>
  )
}
