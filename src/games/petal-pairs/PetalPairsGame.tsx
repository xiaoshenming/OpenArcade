import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import { createPairDeck, getPairLevel, nextSequenceTarget, rotateUnmatched } from './logic'
import './petal-pairs.css'

const scoreFor = (moves: number, mistakes: number) => Math.max(100, 5000 - moves * 70 - mistakes * 120)

export default function PetalPairsGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
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
  const [popping, setPopping] = useState<number[]>([])
  const target = useMemo(() => nextSequenceTarget(deck, matched), [deck, matched])
  const audio = useMemo(() => createGameAudio(), [])
  const reduceMotion = prefersReducedMotion()
  const shaking = !paused && flipped.length === 2 && !(deck[flipped[0]] === deck[flipped[1]] && (!spec.sequence || deck[flipped[0]] === target)) && !reduceMotion

  useEffect(() => {
    if (!popping.length) return
    const timer = window.setTimeout(() => setPopping([]), 320)
    return () => window.clearTimeout(timer)
  }, [popping])

  useEffect(() => audio.setMuted(muted), [audio, muted])

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
        audio.play('match')
        if (!prefersReducedMotion()) setPopping([first, second])
        const nextMatched = [...matched, first, second]
        setMatched(nextMatched)
        if (spec.shifting && nextMatched.length < deck.length) {
          setDeck((items) => rotateUnmatched(items, nextMatched))
          setShiftEpoch((value) => value + 1)
        }
        emit({ type: 'score', score: scoreFor(moves, mistakes) })
      } else {
        audio.play('mismatch')
        const nextMistakes = mistakes + 1
        setMistakes(nextMistakes)
        if (spec.maxMistakes && nextMistakes >= spec.maxMistakes) {
          setFailed(true)
          audio.play('lose')
          emit({ type: 'failed', score: scoreFor(moves, nextMistakes) })
        }
      }
      setFlipped([])
    }, success ? 260 : spec.mismatchMs)
    return () => window.clearTimeout(timer)
  }, [audio, deck, emit, failed, flipped, matched, mistakes, moves, paused, spec.maxMistakes, spec.mismatchMs, spec.sequence, spec.shifting, target])

  useEffect(() => {
    if (moves > 0 && matched.length === deck.length) { audio.play('win'); emit({ type: 'completed', score: scoreFor(moves, mistakes) }) }
  }, [audio, deck.length, emit, matched.length, mistakes, moves])

  const flip = (index: number) => {
    if (paused || failed || previewing || flipped.length >= 2 || flipped.includes(index) || matched.includes(index)) return
    audio.play('select')
    setFlipped((items) => [...items, index])
    if (flipped.length === 1) setMoves((value) => value + 1)
  }

  const ruleIcon = spec.sequence ? <ArrowRight size={14} /> : spec.shifting ? <RefreshCw size={14} /> : spec.maxMistakes ? <ShieldAlert size={14} /> : null
  return (
    <div className={`pairs-game mode-${spec.mode}`} aria-label="花笺成双游戏区">
      <div className="pairs-readout"><span>关卡 {String(levelNumber).padStart(2, '0')}</span><strong>{matched.length / 2} / {deck.length / 2} 对 · {moves} 次</strong></div>
      <div className="pairs-rule"><span>{ruleIcon}{spec.title}</span><small>{spec.detail}</small>{spec.sequence && <em>目标 {target}</em>}{spec.maxMistakes && <em>失误 {mistakes}/{spec.maxMistakes}</em>}</div>
      <div className={`pairs-board ${previewing && spec.previewMode === 'all' ? 'is-previewing' : ''}`} data-shift={shiftEpoch} style={{ '--pair-columns': spec.columns } as React.CSSProperties}>
        {deck.map((symbol, index) => {
          const previewReveal = previewing && (spec.previewMode === 'all' || index === previewIndex)
          const revealed = previewReveal || flipped.includes(index) || matched.includes(index)
          return <button key={`${shiftEpoch}-${index}`} className={`pair-card ${revealed ? 'is-revealed' : ''} ${matched.includes(index) ? 'is-matched' : ''} ${shaking && flipped.includes(index) ? 'is-shaking' : ''} ${popping.includes(index) ? 'is-popping' : ''}`} style={{ '--enter-index': index, '--enter-from': index % 2 === 1 ? '14px' : '-14px', '--reveal-delay': `${index * 36}ms` } as React.CSSProperties} onClick={() => flip(index)} aria-label={revealed ? `卡片 ${index + 1}：${symbol}` : `翻开卡片 ${index + 1}`}><span>{symbol}</span></button>
        })}
      </div>
      <button className="pairs-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
      {previewing && <div className="pairs-preview">记住它们的位置</div>}
    </div>
  )
}
