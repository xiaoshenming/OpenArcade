import { mulberry32, seedFor, shuffle } from '../../platform/rng'

export interface BonsaiNode {
  id: number
  left: number | null
  right: number | null
  parent: number | null
  depth: number
  leaf: boolean
  leafNo: number
}

export interface BonsaiLevel {
  level: number
  chapter: number
  depth: number
  par: number
  budget: number | null
  fog: number[]
  nodes: BonsaiNode[]
  leaves: number[]
  /** 目标叶影 chip 的展示顺序：seeded 洗牌打乱叶序，位置不再泄露叶号 */
  chipOrder: number[]
  cuts: number[]
  target: number[]
  title: string
  detail: string
}

interface Spec {
  depth: number
  cuts: number
  slack: number
  fogWanted: number
  title: string
  detail: string
}

const CHAPTER_STARTS = [1, 12, 23, 34, 45]
const LEAF_MIN = 7
const LEAF_MAX = 15
const NODE_MAX = 45

function resolveSpec(safe: number, chapter: number): Spec {
  const rng = mulberry32(seedFor(safe, 91))
  const inChapter = safe - CHAPTER_STARTS[chapter - 1]
  const copy: [string, string][] = [
    ['初修剪影', '点击枝干剪除整段枝条,拼出目标叶影'],
    ['深冠盆景', '树冠更深,通常需要两三剪达成剪影'],
    ['步数预算', '剪数超预算则失败,撤销一次计五步'],
    ['雾隐叶影', '部分叶影被雾遮蔽,需推断后再落剪'],
    ['大师剪载', '深冠、雾叶与紧预算同时考验手上功夫'],
  ]
  const [title, detail] = copy[chapter - 1]
  if (chapter === 1) return { depth: 4, cuts: 1 + (inChapter >= 5 ? 1 : 0), slack: 0, fogWanted: 0, title, detail }
  if (chapter === 2) return { depth: 5, cuts: 2 + (inChapter >= 6 ? 1 : 0), slack: 0, fogWanted: 0, title, detail }
  if (chapter === 3) return { depth: rng() < 0.5 ? 5 : 6, cuts: 2 + Math.floor(rng() * 3), slack: 6, fogWanted: 0, title, detail }
  if (chapter === 4) return { depth: rng() < 0.3 ? 5 : 6, cuts: 3 + Math.floor(rng() * 2), slack: 6, fogWanted: 2, title, detail }
  return { depth: 6, cuts: 3 + Math.floor(rng() * 3), slack: 7, fogWanted: safe >= 53 ? 3 : 2, title, detail }
}

function growTree(rng: () => number, maxDepth: number): BonsaiNode[] {
  const nodes: BonsaiNode[] = []
  const build = (parent: number | null, depth: number): number => {
    const id = nodes.length
    nodes.push({ id, left: null, right: null, parent, depth, leaf: false, leafNo: 0 })
    const stoppable = depth >= Math.max(2, maxDepth - 2)
    if (depth >= maxDepth || (stoppable && rng() < 0.35)) {
      nodes[id].leaf = true
      return id
    }
    const roll = rng()
    if (roll < 0.6) {
      nodes[id].left = build(id, depth + 1)
      nodes[id].right = build(id, depth + 1)
    } else if (roll < 0.8) nodes[id].left = build(id, depth + 1)
    else nodes[id].right = build(id, depth + 1)
    return id
  }
  build(null, 0)
  return nodes
}

function collectLeaves(nodes: BonsaiNode[]): number[] {
  const leaves: number[] = []
  const walk = (id: number) => {
    const node = nodes[id]
    if (node.left !== null) walk(node.left)
    if (node.leaf) leaves.push(id)
    if (node.right !== null) walk(node.right)
  }
  walk(0)
  return leaves
}

function isAncestor(nodes: BonsaiNode[], ancestor: number, node: number): boolean {
  let cur = nodes[node].parent
  while (cur !== null) {
    if (cur === ancestor) return true
    cur = nodes[cur].parent
  }
  return false
}

function pickCuts(rng: () => number, nodes: BonsaiNode[], count: number): number[] {
  const candidates = shuffle(rng, nodes.slice(1).map((node) => node.id))
  const cuts: number[] = []
  for (const id of candidates) {
    if (cuts.length >= count) break
    if (cuts.some((cut) => isAncestor(nodes, cut, id) || isAncestor(nodes, id, cut))) continue
    cuts.push(id)
  }
  return cuts
}

interface Draft {
  nodes: BonsaiNode[]
  leaves: number[]
  cuts: number[]
  kept: number[]
}

function attempt(safe: number, depth: number, count: number, salt: number): Draft {
  const rng = mulberry32(seedFor(safe, salt))
  const nodes = growTree(rng, depth)
  const leaves = collectLeaves(nodes)
  leaves.forEach((id, index) => {
    nodes[id].leafNo = index + 1
  })
  const cuts = pickCuts(rng, nodes, count)
  const kept = leaves.filter((id) => !cuts.some((cut) => cut === id || isAncestor(nodes, cut, id)))
  return { nodes, leaves, cuts, kept }
}

function viable(draft: Draft, depth: number, count: number) {
  return draft.cuts.length === count
    && draft.kept.length >= 3
    && draft.leaves.length >= LEAF_MIN
    && draft.leaves.length <= LEAF_MAX
    && draft.nodes.length <= NODE_MAX
    && draft.nodes.some((node) => node.depth === depth)
}

function assemble(safe: number, chapter: number, spec: Spec, draft: Draft): BonsaiLevel {
  const target = draft.kept.map((id) => draft.nodes[id].leafNo).sort((a, b) => a - b)
  const rng = mulberry32(seedFor(safe, 303))
  const fogCap = Math.max(0, Math.min(spec.fogWanted, target.length - 2))
  const fog = shuffle(rng, [...target]).slice(0, fogCap).sort((a, b) => a - b)
  const chipOrder = shuffle(rng, [...draft.leaves])
  return {
    level: safe, chapter, depth: spec.depth, par: draft.cuts.length,
    budget: spec.slack > 0 ? draft.cuts.length + spec.slack : null, fog,
    nodes: draft.nodes, leaves: draft.leaves, chipOrder, cuts: draft.cuts, target,
    title: safe === 60 ? '终局·一景成画' : spec.title, detail: spec.detail,
  }
}

export function chapterOf(level: number) {
  if (level <= 11) return 1
  if (level <= 22) return 2
  if (level <= 33) return 3
  if (level <= 44) return 4
  return 5
}

export function getBonsaiLevel(level: number): BonsaiLevel {
  const safe = Math.min(60, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1) || 1))
  const chapter = chapterOf(safe)
  const spec = resolveSpec(safe, chapter)
  let draft = attempt(safe, spec.depth, spec.cuts, 1)
  for (let salt = 2; salt <= 96 && !viable(draft, spec.depth, spec.cuts); salt += 1) draft = attempt(safe, spec.depth, spec.cuts, salt)
  return assemble(safe, chapter, spec, draft)
}
