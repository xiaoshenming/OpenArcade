import { useEffect, useMemo, useState } from 'react'
import { CloudFog, RotateCcw, Scissors, Undo2 } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { prefersReducedMotion } from '../../platform/motion'
import { bonsaiScore, createBonsaiState, cutBranch, removedNodes, undoCut, type BonsaiState } from './logic'
import { getBonsaiLevel, type BonsaiLevel } from './levels'
import './bonsai-prune.css'

const MODES = ['shape', 'deep', 'budget', 'fog', 'master']
const FALL_MS = 560

export default function BonsaiPruneGame({ level = 1, ...props }: GameModuleProps) {
  const spec = useMemo(() => getBonsaiLevel(level), [level])
  return <BonsaiRun key={spec.level} spec={spec} {...props} />
}

function BonsaiRun({ spec, paused, muted, emit }: GameModuleProps & { spec: BonsaiLevel }) {
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<BonsaiState>(createBonsaiState)
  const [falling, setFalling] = useState<number[]>([])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => {
    if (paused || falling.length === 0) return
    const timer = window.setTimeout(() => setFalling((items) => items.slice(1)), FALL_MS)
    return () => window.clearTimeout(timer)
  }, [falling, paused])
  useEffect(() => {
    if (state.over === 'won') {
      audio.play('win')
      emit({ type: 'completed', score: bonsaiScore(spec, state) })
    } else if (state.over === 'lost') {
      audio.play('lose')
      emit({ type: 'failed', score: bonsaiScore(spec, state) })
    }
  }, [audio, emit, spec, state.over, state])

  const report = (next: BonsaiState) => {
    setState(next)
    emit({ type: 'score', score: bonsaiScore(spec, next) })
  }

  const cut = (id: number) => {
    if (paused || state.over !== 'play') return
    const next = cutBranch(spec, state, id)
    if (next === state) return
    audio.play('step')
    report(next)
    if (!prefersReducedMotion()) setFalling((items) => [...items, id])
  }

  const undo = () => {
    if (paused || state.over !== 'play') return
    const next = undoCut(spec, state)
    if (next === state) return
    audio.play('select')
    report(next)
  }

  const gone = removedNodes(spec, state.cuts)
  const over = state.over !== 'play'
  const renderNode = (id: number) => {
    const node = spec.nodes[id]
    const isGone = gone.has(id)
    const dropping = falling.includes(id)
    if (isGone && !dropping) return null
    const kids = [node.left, node.right].filter((kid): kid is number => kid !== null)
    return (
      <li key={id} className={dropping ? 'is-falling' : ''}>
        <button
          className={`bnode ${node.leaf ? 'is-leaf' : 'is-twig'}`}
          onClick={() => cut(id)}
          disabled={isGone || over || paused}
          aria-label={node.leaf ? `剪断第 ${node.leafNo} 片叶的枝` : `剪断枝干 ${id + 1}`}
        >
          {node.leaf ? <span>{node.leafNo}</span> : null}
        </button>
        {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
      </li>
    )
  }
  return (
    <div className={`bonsai-game mode-${MODES[spec.chapter - 1]}`} data-paused={paused || undefined} aria-label="剪枝成景游戏区">
      <div className="bonsai-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 参考 {spec.par} 剪</span>
        <strong>{spec.budget !== null ? `步数 ${state.steps}/${spec.budget}` : `已剪 ${state.totalCuts}`} · {bonsaiScore(spec, state)} 分</strong>
      </div>
      <div className="bonsai-rule">
        <span>{spec.fog.length > 0 ? <CloudFog size={14} /> : <Scissors size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
      </div>
      <div className="bonsai-board">
        <ul className="bonsai-tree">{renderNode(0)}</ul>
      </div>
      <div className="bonsai-target" aria-label="目标叶影">
        {spec.chipOrder.map((id) => {
          const leafNo = spec.nodes[id].leafNo
          const veiled = spec.fog.includes(leafNo) || !spec.target.includes(leafNo)
          return (
            <span
              key={id}
              className={`leaf-chip ${veiled ? 'is-veiled' : 'is-kept'}`}
              title={veiled ? `雾隐叶 ${leafNo}` : `保留叶 ${leafNo}`}
            >
              {veiled ? <>🌫<span className="leaf-chip-reveal" aria-hidden="true">{leafNo}</span></> : leafNo}
            </span>
          )
        })}
      </div>
      <div className="bonsai-actions">
        <button className="bonsai-button" onClick={undo} disabled={!state.cuts.length || over || paused} title="撤销上一剪(+5 步)">
          <Undo2 size={17} /><span>撤销 {state.undos > 0 ? `×${state.undos}` : ''}</span>
        </button>
        <button className="bonsai-button" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} /><span>重开本关</span></button>
      </div>
      {state.over === 'won' && <div className="bonsai-panel"><span>剪枝成景</span><strong>{bonsaiScore(spec, state)}</strong></div>}
      {state.over === 'lost' && <div className="bonsai-panel is-fail"><span>预算耗尽</span><strong>{bonsaiScore(spec, state)}</strong></div>}
    </div>
  )
}
