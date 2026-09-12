import { useEffect, useMemo, useState } from 'react'
import { CloudFog, Eye, EyeOff, Link2, Mountain, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { isSolved, linkedPartner, rotateTile, sceneLayers, sceneSlice, scoreFor, tilePosition, turnExcess } from './logic'
import { createWindowLevel, type WindowLevel } from './levels'
import './window-slide.css'

export default function WindowSlideGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const levelData = useMemo(() => createWindowLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <WindowSession key={levelNumber} levelData={levelData} paused={paused} audio={audio} emit={emit} />
}

function WindowSession({ levelData, paused, audio, emit }: { levelData: WindowLevel; paused: boolean; audio: GameAudio; emit: (event: GameEvent) => void }) {
  const levelNumber = levelData.level
  const [turns, setTurns] = useState<number[]>(() => [...levelData.turns])
  const [clicks, setClicks] = useState(0)
  const [peeks, setPeeks] = useState(0)
  const [fogged, setFogged] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [over, setOver] = useState<'win' | 'lose' | null>(null)

  useEffect(() => {
    if (paused || !levelData.fog || fogged || over) return
    const timer = window.setTimeout(() => setFogged(true), 8000)
    return () => window.clearTimeout(timer)
  }, [fogged, levelData.fog, over, paused])

  useEffect(() => {
    if (paused || !peeking) return
    const timer = window.setTimeout(() => setPeeking(false), 4000)
    return () => window.clearTimeout(timer)
  }, [paused, peeking])

  const fullScene = useMemo(() => sceneSlice(levelData.scene), [levelData.scene])
  const image = useMemo(() => sceneLayers(levelData.scene), [levelData.scene])
  const thumbVisible = !levelData.fog || !fogged || peeking
  const settled = turns.filter((turn, index) => turnExcess(turn, levelData.deltas[index] ?? 0) === 0).length
  const remaining = levelData.budget === undefined ? null : Math.max(0, levelData.budget - clicks)

  const reset = () => {
    if (paused) return
    setTurns([...levelData.turns])
    setClicks(0)
    setPeeks(0)
    setFogged(false)
    setPeeking(false)
    setOver(null)
  }

  const peek = () => {
    if (paused || over || !levelData.fog || !fogged || peeking) return
    const nextPeeks = peeks + 1
    setPeeks(nextPeeks)
    setPeeking(true)
    audio.play('step')
    emit({ type: 'score', score: scoreFor(clicks, levelData.par, nextPeeks) })
  }

  const turn = (index: number) => {
    if (paused || over) return
    const partner = linkedPartner(levelData.links, index)
    const next = rotateTile(turns, index, partner)
    const nextClicks = clicks + 1
    const current = scoreFor(nextClicks, levelData.par, peeks)
    setTurns(next)
    setClicks(nextClicks)
    audio.play(next[index] % 4 === levelData.deltas[index] % 4 ? 'match' : 'select')
    emit({ type: 'score', score: current })
    if (isSolved(next, levelData.deltas)) {
      setOver('win')
      audio.play('win')
      emit({ type: 'completed', score: current })
      return
    }
    if (levelData.budget !== undefined && nextClicks >= levelData.budget) {
      setOver('lose')
      audio.play('lose')
      emit({ type: 'failed', score: current })
    }
  }

  return (
    <div className={`ws-game mode-${levelData.mode}`} aria-label="拼图窗景游戏区">
      <div className="ws-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · {levelData.scene.name} · 参考 {levelData.par} 转</span>
        <strong>{clicks}{levelData.budget !== undefined ? ` / ${levelData.budget}` : ''} 转 · 归位 {settled}/{levelData.grid * levelData.grid}</strong>
      </div>
      <div className="ws-rule">
        <span><Mountain size={14} />{levelData.title}</span>
        <small>{levelData.detail}</small>
        {levelData.links.length > 0 && <em>联动 {levelData.links.length} 对</em>}
        {levelData.fogs.length > 0 && <em>迷雾 {levelData.fogs.length} 瓦</em>}
        {remaining !== null && <em>剩 {remaining} 步</em>}
        {levelData.fog && <em>重看 −{peeks * 30}</em>}
      </div>
      <div className="ws-stage">
        <div className={`ws-window ${over === 'win' ? 'is-done' : ''} ${over === 'lose' ? 'is-fail' : ''}`}>
          <div className="ws-board" style={{ '--ws-size': levelData.grid } as React.CSSProperties}>
            {turns.map((turnCount, index) => {
              const fogTile = levelData.fogs.includes(index)
              const linked = levelData.links.some(({ a, b }) => a === index || b === index)
              const delta = levelData.deltas[index] ?? 0
              return (
                <button
                  key={index}
                  className={`ws-tile ${fogTile ? 'is-fogged' : ''}`}
                  onClick={() => turn(index)}
                  disabled={over !== null}
                  aria-label={`瓦片 ${index + 1}${linked ? '，联动共转' : ''}${fogTile ? '，图案被雾遮蔽' : ''}${delta === 2 ? '，镜像瓦' : ''}，当前朝向 ${(turnCount % 4) * 90} 度`}
                >
                  <span
                    className="ws-tile-scene"
                    style={{
                      backgroundImage: image,
                      backgroundSize: `${levelData.grid * 100}% ${levelData.grid * 100}%`,
                      backgroundPosition: tilePosition(levelData.grid, index),
                      transform: `rotate(${(turnCount + delta) * 90}deg)`,
                    }}
                  />
                  {linked && <span className="ws-tile-link"><Link2 size={10} /></span>}
                  {fogTile && <span className="ws-tile-fog"><CloudFog size={14} />迷雾瓦</span>}
                </button>
              )
            })}
          </div>
          {over && <div className={`ws-banner ${over === 'win' ? 'is-win' : 'is-lose'}`}>{over === 'win' ? '窗景复原' : '预算耗尽'}</div>}
        </div>
        <div className="ws-side">
          <div
            className={`ws-thumb ${thumbVisible ? '' : 'is-fogged'}`}
            style={{ backgroundImage: fullScene.image, backgroundSize: fullScene.size, backgroundPosition: fullScene.position }}
          >
            <span className="ws-thumb-tag">{peeking ? '重看中' : '目标窗景'}</span>
            {!thumbVisible && <span className="ws-thumb-fog"><EyeOff size={16} />已入雾</span>}
          </div>
          {levelData.fog && (
            <button className="ws-peek" onClick={peek} disabled={paused || over !== null || !fogged || peeking}>
              <Eye size={14} />重看目标 −30
            </button>
          )}
          <button className="ws-restart" onClick={reset} disabled={paused}>
            <RotateCcw size={15} />重排本关
          </button>
        </div>
      </div>
    </div>
  )
}
