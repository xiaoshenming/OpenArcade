export const FLAVORS = ['sweet', 'spicy', 'umami'] as const
export type Flavor = (typeof FLAVORS)[number]
export type Trio = Record<Flavor, number>

export interface Ingredient {
  readonly id: number
  readonly name: string
  readonly trio: Trio
  readonly limit: number
}

export interface ChefDish {
  readonly target: Trio
  readonly par: number
  readonly solution: readonly number[]
}

export interface ChefLevel {
  readonly shelf: readonly Ingredient[]
  readonly dishes: readonly ChefDish[]
  readonly budget: number
  readonly lives: number
}

export const emptyTrio = (): Trio => ({ sweet: 0, spicy: 0, umami: 0 })
export const addTrio = (a: Trio, b: Trio): Trio => ({ sweet: a.sweet + b.sweet, spicy: a.spicy + b.spicy, umami: a.umami + b.umami })
export const scaleTrio = (a: Trio, factor: number): Trio => ({ sweet: a.sweet * factor, spicy: a.spicy * factor, umami: a.umami * factor })
export const subTrio = (a: Trio, b: Trio): Trio => ({ sweet: a.sweet - b.sweet, spicy: a.spicy - b.spicy, umami: a.umami - b.umami })
export const sameTrio = (a: Trio, b: Trio) => a.sweet === b.sweet && a.spicy === b.spicy && a.umami === b.umami
export const trioKey = (a: Trio) => `${a.sweet}.${a.spicy}.${a.umami}`
export const isBlank = (a: Trio) => a.sweet === 0 && a.spicy === 0 && a.umami === 0
export const exceeds = (rest: Trio, cost: Trio) => rest.sweet < cost.sweet || rest.spicy < cost.spicy || rest.umami < cost.umami
export const dominantFlavor = (a: Trio): Flavor => (FLAVORS.find((flavor) => a[flavor] > 0 && FLAVORS.every((other) => a[other] <= a[flavor]))) ?? 'umami'

export const ingredientById = (shelf: readonly Ingredient[], id: number): Ingredient | null => shelf.find((item) => item.id === id) ?? null
export const countUses = (plate: readonly number[], id: number) => plate.reduce((sum, item) => (item === id ? sum + 1 : sum), 0)

export function plateSum(shelf: readonly Ingredient[], plate: readonly number[]): Trio {
  return plate.reduce<Trio>((sum, id) => {
    const item = ingredientById(shelf, id)
    return item ? addTrio(sum, item.trio) : sum
  }, emptyTrio())
}

export const canAdd = (shelf: readonly Ingredient[], plate: readonly number[], id: number) => {
  const item = ingredientById(shelf, id)
  return !!item && countUses(plate, id) < item.limit
}

export const gapTrio = (target: Trio, sum: Trio): Trio => subTrio(target, sum)
export const gapState = (target: Trio, sum: Trio): 'exact' | 'over' | 'under' => {
  if (sameTrio(target, sum)) return 'exact'
  const gap = gapTrio(target, sum)
  return gap.sweet < 0 || gap.spicy < 0 || gap.umami < 0 ? 'over' : 'under'
}

export function canCook(shelf: readonly Ingredient[], target: Trio): boolean {
  const seen = new Set<string>()
  const visit = (index: number, rest: Trio): boolean => {
    if (isBlank(rest)) return true
    if (index >= shelf.length) return false
    const key = `${index}|${trioKey(rest)}`
    if (seen.has(key)) return false
    seen.add(key)
    for (let uses = 0; uses <= shelf[index].limit; uses += 1) {
      const cost = scaleTrio(shelf[index].trio, uses)
      if (exceeds(rest, cost)) break
      if (visit(index + 1, subTrio(rest, cost))) return true
    }
    return false
  }
  return visit(0, target)
}

export const scoreFor = (adds: number, par: number, mistakes: number) => Math.max(100, 1000 - Math.max(0, adds - par) * 25 - mistakes * 60)
