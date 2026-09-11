export const EASINGS = {
  standard: 'cubic-bezier(.2, 0, 0, 1)',
  spring: 'cubic-bezier(.34, 1.56, .64, 1)',
  exit: 'cubic-bezier(.4, 0, 1, 1)',
} as const

export type EasingName = keyof typeof EASINGS

export interface TweenOptions {
  duration: number
  easing?: EasingName
  fill?: FillMode
  delay?: number
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function tween(element: Element, keyframes: Keyframe[], options: TweenOptions): Promise<void> {
  if (prefersReducedMotion() || typeof element.animate !== 'function') return Promise.resolve()
  const animation = element.animate(keyframes, {
    duration: options.duration,
    delay: options.delay ?? 0,
    easing: EASINGS[options.easing ?? 'standard'],
    fill: options.fill ?? 'both',
  })
  return animation.finished.then(() => undefined, () => undefined)
}
