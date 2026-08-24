import { gameManifestSchema, type GameManifest } from './types'

const manifests = [
  {
    id: 'water-sort',
    title: '琉璃分色',
    shortTitle: '分色',
    description: '倾倒相连的同色液体，让每只试管只留下同一种颜色。',
    category: 'logic',
    accent: '#ef476f',
    loader: 'module',
    moduleId: 'water-sort',
    status: 'ready',
  },
  {
    id: 'orbit-tap',
    title: '星点节拍',
    shortTitle: '节拍',
    description: '在星点亮起时击中它，二十秒内累积尽可能高的分数。',
    category: 'arcade',
    accent: '#06a6a6',
    loader: 'iframe',
    src: '/games/orbit-tap/index.html',
    status: 'ready',
  },
  {
    id: 'petal-pairs',
    title: '花笺成双',
    shortTitle: '成双',
    description: '翻开花笺，记住图案，让散落的心意重新成双。',
    category: 'cozy',
    accent: '#ffb000',
    loader: 'module',
    moduleId: 'petal-pairs',
    status: 'soon',
  },
] satisfies unknown[]

export const games: GameManifest[] = manifests.map((game) => gameManifestSchema.parse(game))
