import { mulberry32, seedFor, shuffle } from '../../platform/rng'
import { addTrio, canCook, emptyTrio, FLAVORS, isBlank, sameTrio, trioKey, type ChefDish, type ChefLevel, type Flavor, type Ingredient, type Trio } from './logic'

export interface ChefSpec {
  readonly level: number
  readonly chapter: number
  readonly mode: string
  readonly shelfSize: number
  readonly dishCount: number
  readonly picks: number
  readonly limitItems: number
  readonly solo: boolean
  readonly slack: number
  readonly title: string
  readonly detail: string
}

interface ChapterConfig {
  readonly begin: number
  readonly count: number
  readonly shelf: number
  readonly picks: number
  readonly picksRamp: number
  readonly dishes: number
  readonly limitItems: number
  readonly slack: number
  readonly mode: string
  readonly title: string
  readonly detail: string
}

const CHAPTERS: readonly ChapterConfig[] = [
  { begin: 1, count: 11, shelf: 6, picks: 2, picksRamp: 0, dishes: 1, limitItems: 0, slack: 8, mode: 'taste', title: '初尝甜头', detail: '目标只有单一风味，认准可用食材，凑齐精确数值即可上菜' },
  { begin: 12, count: 11, shelf: 7, picks: 3, picksRamp: 0, dishes: 1, limitItems: 0, slack: 7, mode: 'recipe', title: '三味定谱', detail: '甜辣鲜三维全面开花，三种食材的数值和要一分不差' },
  { begin: 23, count: 11, shelf: 7, picks: 3, picksRamp: 1, dishes: 1, limitItems: 2, slack: 6, mode: 'ration', title: '配额掌勺', detail: '部分食材可重复取用但次数有限，先算清配额再下锅' },
  { begin: 34, count: 11, shelf: 8, picks: 4, picksRamp: 0, dishes: 1, limitItems: 3, slack: 5, mode: 'crowd', title: '满席急单', detail: '食客更多、货架更挤、预算更紧，四种食材拼出大单' },
  { begin: 45, count: 16, shelf: 9, picks: 3, picksRamp: 0, dishes: 2, limitItems: 3, slack: 4, mode: 'gauntlet', title: '终局·双席星宴', detail: '两道菜依次上桌：先精确交出一席，再清空案板做下一席' },
]

const NAMES: Record<Flavor, readonly string[]> = {
  sweet: ['草莓', '蜜桃', '蜂蜜', '椰奶', '冰糖', '糖渍梅'],
  spicy: ['火椒', '麻椒', '辣油', '姜爆', '芥末', '辣豆豉'],
  umami: ['香菇', '海苔', '昆布', '虾酱', '味噌', '松茸'],
}

export function getChefSpec(level: number): ChefSpec {
  const safe = Math.min(60, Math.max(1, Math.floor(level)))
  const index = CHAPTERS.findIndex((chapter) => safe < chapter.begin + chapter.count)
  const config = CHAPTERS[index < 0 ? CHAPTERS.length - 1 : index]
  const progress = (safe - config.begin) / (config.count - 1)
  return {
    level: safe,
    chapter: CHAPTERS.indexOf(config) + 1,
    mode: config.mode,
    shelfSize: config.shelf + Math.round(progress * (config.mode === 'crowd' ? 1 : 0)),
    dishCount: config.dishes,
    picks: config.picks + Math.round(progress * config.picksRamp),
    limitItems: config.limitItems,
    solo: config.mode === 'taste',
    slack: config.slack,
    title: safe === 60 ? '终局·双席星宴' : config.title,
    detail: config.detail,
  }
}

const rollValue = (random: () => number, high: number) => 1 + Math.floor(random() * high)

function rollSolutionTrio(spec: ChefSpec, random: () => number): Trio {
  const trio = emptyTrio()
  for (const flavor of FLAVORS) {
    trio[flavor] = spec.solo && flavor !== 'sweet' ? 0 : rollValue(random, 6)
  }
  return trio
}

function rollDistractorTrio(spec: ChefSpec, random: () => number): Trio {
  if (spec.solo) {
    const trio = emptyTrio()
    const flavor: Flavor = random() < 0.55 ? 'sweet' : 'spicy'
    trio[flavor] = rollValue(random, 9)
    return trio
  }
  const trio = emptyTrio()
  for (const flavor of FLAVORS) trio[flavor] = Math.floor(random() * 7)
  return isBlank(trio) ? { sweet: 1, spicy: 0, umami: 0 } : trio
}

interface RawItem {
  readonly trio: Trio
  readonly dish: number
  limit: number
}

export function createChefLevel(level: number): ChefLevel {
  const spec = getChefSpec(level)
  const random = mulberry32(seedFor(spec.level, 69))
  const names = shuffle(random, [...NAMES.sweet, ...NAMES.spicy, ...NAMES.umami])
  const targets: Trio[] = []
  const raw: RawItem[] = []
  const taken = new Set<string>()
  for (let dish = 0; dish < spec.dishCount; dish += 1) {
    const solution: Trio[] = []
    for (let pick = 0; pick < spec.picks; pick += 1) {
      let trio = rollSolutionTrio(spec, random)
      for (let attempt = 0; attempt < 60 && taken.has(trioKey(trio)); attempt += 1) trio = rollSolutionTrio(spec, random)
      solution.push(trio)
      taken.add(trioKey(trio))
      raw.push({ trio, dish, limit: 1 })
    }
    targets.push(solution.reduce((sum, entry) => addTrio(sum, entry), emptyTrio()))
  }
  targets.forEach((target) => taken.add(trioKey(target)))
  while (raw.length < spec.shelfSize) {
    const trio = rollDistractorTrio(spec, random)
    const key = trioKey(trio)
    if (taken.has(key) || targets.some((target) => sameTrio(target, trio))) continue
    taken.add(key)
    raw.push({ trio, dish: -1, limit: 1 })
  }
  const arranged = shuffle(random, raw)
  const limited = new Set(shuffle(random, arranged.map((_, index) => index)).slice(0, spec.limitItems))
  const shelf: Ingredient[] = arranged.map((item, index) => ({ id: index + 1, name: names[index % names.length], trio: item.trio, limit: limited.has(index) ? 2 : 1 }))
  const dishes: ChefDish[] = targets.map((target, index) => ({
    target,
    par: spec.picks,
    solution: shelf.filter((_, shelfIndex) => arranged[shelfIndex].dish === index).map((item) => item.id),
  }))
  const par = dishes.reduce((sum, dish) => sum + dish.par, 0)
  return { shelf, dishes, budget: par + spec.slack, lives: 3 }
}

export function verifyDish(level: ChefLevel, dish: ChefDish): boolean {
  const usable = level.shelf.filter((item) => dish.solution.includes(item.id))
  const sum = usable.reduce((acc, item) => addTrio(acc, item.trio), emptyTrio())
  return sameTrio(sum, dish.target) && usable.every((item) => item.limit >= 1) && dish.solution.length === dish.par
}

export const cookable = (level: ChefLevel) => level.dishes.every((dish) => canCook(level.shelf, dish.target))
