import type { WaterLevel } from './levels'

export type WaterMode = 'guided' | 'precision' | 'fog' | 'sealed' | 'gauntlet'
export interface WaterRule {
  chapter: number
  mode: WaterMode
  title: string
  detail: string
  moveLimit?: number
  hiddenLayers?: boolean
  lockTube?: number
  unlockMoves?: number
  noUndo?: boolean
  guided?: boolean
}

const openingModes: WaterMode[] = ['guided', 'precision', 'fog', 'sealed', 'gauntlet']
const openingCopy: Record<WaterMode, [string, string]> = {
  guided: ['流向提示', '选中试管后显示可倒入位置'], precision: ['步数挑战', '在限定步数内完成分色'],
  fog: ['雾中琉璃', '只有每支试管的顶层颜色可见'], sealed: ['封印试管', '带锁试管会在若干步后开放'],
  gauntlet: ['大师试炼', '迷雾、限步，并且无法撤销'],
}
const chapters = [
  ['precision','精确倾倒','逐关收紧可用步数',1,0,0,0], ['fog','雾色记忆','在遮挡中建立颜色记忆',0,1,0,0],
  ['sealed','封印调度','先规划封印解除前的路线',0,0,1,0], ['gauntlet','雾中限步','迷雾、限步与禁用撤销结合',1,1,0,1],
  ['sealed','雾锁双局','迷雾与封印同时改变信息和空间',0,1,1,0], ['gauntlet','封印精算','封印、限步与禁用撤销结合',1,0,1,1],
  ['gauntlet','无悔迷雾','在迷雾中完成不可撤销路线',0,1,0,1], ['gauntlet','锁管极限','封印、限步与无撤销同步生效',1,0,1,1],
  ['gauntlet','雾锁精算','迷雾、封印与限步三项结合',1,1,1,0], ['gauntlet','无悔雾锁','迷雾、封印与无撤销结合',0,1,1,1],
  ['gauntlet','终局·琉璃矩阵','迷雾、封印、限步与无撤销全部生效',1,1,1,1],
] as const

function findSafeLock(level: WaterLevel, moves: number) {
  const used = new Set(level.solution.slice(0, moves * 2).split('').map(Number))
  for (let index = level.tubes.length - 1; index >= 0; index -= 1) if (!used.has(index)) return index
  return level.tubes.length - 1
}

export function getWaterRule(levelNumber: number, level: WaterLevel): WaterRule {
  const safe = Math.min(60, Math.max(1, Math.floor(levelNumber)))
  const chapter = Math.floor((safe - 1) / 5) + 1
  let mode: WaterMode
  let title: string
  let detail: string
  let limited: boolean, fog: boolean, sealed: boolean, noUndo: boolean
  if (safe <= 5) {
    mode = openingModes[safe - 1]
    ;[title, detail] = openingCopy[mode]
    limited = mode === 'precision' || mode === 'gauntlet'
    fog = mode === 'fog' || mode === 'gauntlet'
    sealed = mode === 'sealed'
    noUndo = mode === 'gauntlet'
  } else {
    const preset = chapters[chapter - 2]
    ;[mode, title, detail] = preset
    limited = Boolean(preset[3]); fog = Boolean(preset[4]); sealed = Boolean(preset[5]); noUndo = Boolean(preset[6])
  }
  const unlockMoves = 2 + Math.floor(safe / 20)
  return {
    chapter, mode, title: safe === 60 ? '终局·万色归一' : title, detail,
    guided: mode === 'guided', hiddenLayers: fog, noUndo,
    moveLimit: limited ? level.par + Math.max(2, 5 - Math.floor(safe / 15)) : undefined,
    lockTube: sealed ? findSafeLock(level, unlockMoves) : undefined,
    unlockMoves: sealed ? unlockMoves : undefined,
  }
}
