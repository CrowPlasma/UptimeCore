/**
 * utils/soundAlert.ts
 * Síntesis de alertas sonoras NOC mediante Web Audio API (sin archivos externos).
 */

const STORAGE_KEY = 'uptimecore_sound_enabled'

let audioCtx: AudioContext | null = null
let lastSoundAt = 0

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!audioCtx) {
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    if (enabled) {
      playTestSound()
    }
  } catch {
    // ignore
  }
}

/** Tono corto de confirmación al activar las alertas sonoras */
export function playTestSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, now) // D5
    osc.frequency.setValueAtTime(880, now + 0.1) // A5
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.28)
  } catch {
    // ignore
  }
}

/** Alerta NOC de dos tonos cuando un monitor cae a DOWN */
export function playDownAlert(): void {
  if (!isSoundEnabled()) return
  // Evitar saturación de sonido si caen varios monitores en el mismo lote (cooldown 2.5s)
  if (Date.now() - lastSoundAt < 2500) return
  lastSoundAt = Date.now()

  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const freqs = [880, 659.25, 880, 659.25] // A5 -> E5 -> A5 -> E5
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      const start = now + idx * 0.14
      osc.frequency.setValueAtTime(f, start)
      gain.gain.setValueAtTime(0.18, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.13)
    })
  } catch {
    // ignore
  }
}

/** Tono suave ascendente cuando un monitor se recupera a UP */
export function playRecoveredAlert(): void {
  if (!isSoundEnabled()) return
  if (Date.now() - lastSoundAt < 2500) return
  lastSoundAt = Date.now()

  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const freqs = [523.25, 659.25, 783.99] // C5 -> E5 -> G5
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const start = now + idx * 0.1
      osc.frequency.setValueAtTime(f, start)
      gain.gain.setValueAtTime(0.1, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.13)
    })
  } catch {
    // ignore
  }
}
