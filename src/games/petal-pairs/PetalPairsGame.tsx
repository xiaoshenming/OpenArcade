import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createPairDeck, getPairLevel, nextSequenceTarget, rotateUnmatched } from './logic'
import './petal-pairs.css'

const scoreFor = (moves: number, mistakes: number) => Math.max(100, 5000 - moves * 70 - mistakes * 120)

export default function PetalPairsGame({ paused, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(40, Math.max(1, level))
  const spec = getPairLevel(levelNumber)
  const [deck, setDeck] = useState(() => createPairDeck(levelNumber))
  const [previewing, setPreviewing] = useState(spec.previewMode !== 'none')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [shiftEpoch, setShiftEpoch] = useState(0)
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [failed, setFailed] = useState(false)
  const target = useMemo(() => nextSequenceTarget(deck, matched), [deck, matched])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (paused || !previewing) return
    const timer = window.setTimeout(() => setPreviewing(false), spec.previewMs)
    const pulse = spec.previewMode === 'pulse' ? window.setInterval(() => setPreviewIndex((value) => (value + 1) % deck.length), 280) : undefined
    return () => { window.clearTimeout(timer); if (pulse) window.clearInterval(pulse) }
  }, [deck.length, paused, previewing, spec.previewMode, spec.previewMs])

  useEffect(() => {
    if (paused || failed || flipped.length !== 2) return
    const [first, second] = flipped
    const same = deck[first] === deck[second]
    const allowed = !spec.sequence || deck[first] === target
    const success = same && allowed
    const timer = window.setTimeout(() => {
      if (success) {
        const nextMatched = [...matched, first, second]
        setMatched(nextMatched)
        if (spec.shifting && nextMatched.length < deck.length) {
          setDeck((items) => rotateUnmatched(items, nextMatched))
          setShiftEpoch((value) => value + 1)
        }
        emit({ type: 'score', score: scoreFor(moves, mistakes) })
      } else {
        const nextMistakes = mistakes + 1
        setMistakes(nextMistakes)
        if (spec.maxMistakes && nextMistakes >= spec.maxMistakes) {
          setFailed(true)
          emit({ type: 'failed', score: scoreFor(moves, nextMistakes) })
        }
      }
      setFlipped([])
    }, success ? 260 : spec.mismatchMs)
    return () => window.clearTimeout(timer)
  }, [deck, emit, failed, flipped, matched, mistakes, moves, paused, spec.maxMistakes, spec.mismatchMs, spec.sequence, spec.shifting, target])

  useEffect(() => {
    if (moves > 0 && matched.length === deck.length) emit({ type: 'completed', score: scoreFor(moves, mistakes) })
  }, [deck.length, emit, matched.length, mistakes, moves])

  const flip = (index: number) => {
    if (paused || failed || previewing || flipped.length >= 2 || flipped.includes(index) || matched.includes(index)) return
    setFlipped((items) => [...items, index])
    if (flipped.length === 1) setMoves((value) => value + 1)
  }

  const ruleIcon = spec.sequence ? <ArrowRight size={14} /> : spec.shifting ? <RefreshCw size={14} /> : spec.maxMistakes ? <ShieldAlert size={14} /> : null
  return (
    <div className={`pairs-game mode-${spec.mode}`} aria-label="花笺成双游戏区">
      <div className="pairs-readout"><span>关卡 {String(levelNumber).padStart(2, '0')}</span><strong>{matched.length / 2} / {deck.length / 2} 对 · {moves} 次</strong></div>
      <div className="pairs-rule"><span>{ruleIcon}{spec.title}</span><small>{spec.detail}</small>{spec.sequence && <em>目标 {target}</em>}{spec.maxMistakes && <em>失误 {mistakes}/{spec.maxMistakes}</em>}</div>
      <div className="pairs-board" data-shift={shiftEpoch} style={{ '--pair-columns': spec.columns } as React.CSSProperties}>
        {deck.map((symbol, index) => {
          const previewReveal = previewing && (spec.previewMode === 'all' || index === previewIndex)
          const revealed = previewReveal || flipped.includes(index) || matched.includes(index)
          return <button key={`${shiftEpoch}-${index}`} className={`pair-card ${revealed ? 'is-revealed' : ''} ${matched.includes(index) ? 'is-matched' : ''}`} onClick={() => flip(index)} aria-label={revealed ? `卡片 ${index + 1}：${symbol}` : `翻开卡片 ${index + 1}`}><span>{symbol}</span></button>
        })}
      </div>
      <button className="pairs-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
      {previewing && <div className="pairs-preview">记住它们的位置</div>}
      {failed && <div className="pairs-fail"><strong>失误用尽</strong><span>记住变化，再试一次</span><button onClick={() => emit({ type: 'request-restart' })}>重新挑战</button></div>}
    </div>
  )
}
