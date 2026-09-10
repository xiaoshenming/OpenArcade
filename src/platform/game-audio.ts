export type SoundCue = 'select' | 'step' | 'match' | 'mismatch' | 'win' | 'lose'

const cues: Record<SoundCue, { type: OscillatorType; notes: number[]; gain: number; stepMs: number }> = {
  select: { type: 'triangle', notes: [660], gain: 0.05, stepMs: 60 },
  step: { type: 'sine', notes: [330, 415], gain: 0.06, stepMs: 55 },
  match: { type: 'triangle', notes: [523, 659], gain: 0.06, stepMs: 70 },
  mismatch: { type: 'sawtooth', notes: [196, 147], gain: 0.04, stepMs: 90 },
  win: { type: 'triangle', notes: [523, 659, 784, 1047], gain: 0.06, stepMs: 95 },
  lose: { type: 'sine', notes: [330, 247, 185], gain: 0.05, stepMs: 120 },
}

export interface GameAudio {
  play: (cue: SoundCue) => void
  setMuted: (muted: boolean) => void
}

export function createGameAudio(): GameAudio {
  let muted = false
  let context: AudioContext | null = null
  const ensureContext = () => {
    if (context || muted) return context
    const constructor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    if (!constructor) return null
    try {
      context = new constructor()
    } catch {
      context = null
    }
    return context
  }
  return {
    setMuted(next) {
      muted = next
    },
    play(cue) {
      const audio = ensureContext()
      if (!audio || muted) return
      const spec = cues[cue]
      spec.notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        const start = audio.currentTime + (index * spec.stepMs) / 1000
        const end = start + spec.stepMs / 1000 + 0.05
        oscillator.type = spec.type
        oscillator.frequency.value = frequency
        envelope.gain.setValueAtTime(0.0001, start)
        envelope.gain.exponentialRampToValueAtTime(spec.gain, start + 0.012)
        envelope.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(envelope).connect(audio.destination)
        oscillator.start(start)
        oscillator.stop(end + 0.02)
      })
    },
  }
}
