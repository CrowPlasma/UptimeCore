/**
 * utils/soundAlert.ts
 * Sistema robusto de alertas sonoras NOC para UptimeCore.
 * Utiliza Web Audio API con desbloqueo automático en interacción de usuario
 * y respaldo garantizado mediante audio PCM/WAV sintetizado en memoria (Data URI).
 */

const STORAGE_KEY = 'uptimecore_sound_enabled'

let audioCtx: AudioContext | null = null
let lastSoundAt = 0

// Auto-desbloqueo de AudioContext en la primera interacción del usuario con la página
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (Ctx) audioCtx = new Ctx()
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {})
      }
    } catch {}
  }
  window.addEventListener('click', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
}

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    if (!audioCtx) {
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
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
    // Desbloquear inmediatamente el contexto de audio al interactuar
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  } catch {
    // ignore
  }
}

export interface ToneStep {
  freq: number
  duration: number
  volume?: number
  type?: OscillatorType
}

/**
 * Genera un archivo WAV en memoria como Data URI (Base64) para reproducción 100% garantizada
 * como fallback si Web Audio API está suspendido o bloqueado por el navegador.
 */
function createWavDataUri(tones: ToneStep[], sampleRate = 22050): string {
  let totalSamples = 0
  for (const t of tones) totalSamples += Math.floor(t.duration * sampleRate)
  const buffer = new ArrayBuffer(44 + totalSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + totalSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // Mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, totalSamples * 2, true)

  let offset = 44
  for (const t of tones) {
    const numSamples = Math.floor(t.duration * sampleRate)
    const vol = t.volume ?? 0.35
    for (let i = 0; i < numSamples; i++) {
      const time = i / sampleRate
      let envelope = 1
      const attack = 0.015
      const decay = 0.04
      if (time < attack) envelope = time / attack
      else if (time > t.duration - decay) envelope = Math.max(0, (t.duration - time) / decay)

      let sampleVal = Math.sin(2 * Math.PI * t.freq * time)
      if (t.type === 'triangle') {
        sampleVal = (2 / Math.PI) * Math.asin(sampleVal)
      }
      const pcm = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * vol * envelope * 32767)))
      view.setInt16(offset, pcm, true)
      offset += 2
    }
  }

  // Convertir buffer a base64 seguro para navegador
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return 'data:audio/wav;base64,' + btoa(binary)
}

function playViaHtmlAudio(tones: ToneStep[]): void {
  try {
    const uri = createWavDataUri(tones)
    const audio = new Audio(uri)
    audio.volume = 1.0
    audio.play().catch(() => {})
  } catch {}
}

/**
 * Reproduce una secuencia de tonos utilizando Web Audio API con fallback a HTML5 Audio.
 */
function playToneSequence(tones: ToneStep[]): void {
  const ctx = getAudioContext()

  if (!ctx || ctx.state === 'suspended') {
    // Si Web Audio no está disponible o está suspendido, reproducir vía HTML5 Audio inmediatamente
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    playViaHtmlAudio(tones)
    return
  }

  try {
    const now = ctx.currentTime + 0.04 // Offset seguro para que ningún evento quede en el pasado
    let accumulatedTime = now

    tones.forEach((tone) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = tone.type || 'sine'
      osc.frequency.setValueAtTime(tone.freq, accumulatedTime)

      const vol = tone.volume ?? 0.35
      const startTime = accumulatedTime
      const endTime = startTime + tone.duration

      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.015)
      gain.gain.setValueAtTime(vol, endTime - 0.03)
      gain.gain.linearRampToValueAtTime(0.0001, endTime)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startTime)
      osc.stop(endTime + 0.02)

      accumulatedTime += tone.duration
    })
  } catch {
    // Fallback a HTML5 Audio en caso de error en Web Audio
    playViaHtmlAudio(tones)
  }
}

/** Tono corto y claro de confirmación al activar las alertas sonoras */
export function playTestSound(): void {
  playToneSequence([
    { freq: 587.33, duration: 0.12, volume: 0.35, type: 'sine' }, // D5
    { freq: 880.0, duration: 0.22, volume: 0.4, type: 'sine' },  // A5
  ])
}

/** Alerta NOC de 4 pulsos (urgente y clara) cuando un monitor cae a DOWN */
export function playDownAlert(): void {
  if (!isSoundEnabled()) return
  if (Date.now() - lastSoundAt < 2000) return
  lastSoundAt = Date.now()

  playToneSequence([
    { freq: 880.0, duration: 0.14, volume: 0.45, type: 'triangle' },
    { freq: 659.25, duration: 0.14, volume: 0.45, type: 'triangle' },
    { freq: 880.0, duration: 0.14, volume: 0.45, type: 'triangle' },
    { freq: 659.25, duration: 0.16, volume: 0.45, type: 'triangle' },
  ])
}

/** Tono ascendente armonioso de 3 notas cuando un monitor se recupera a UP */
export function playRecoveredAlert(): void {
  if (!isSoundEnabled()) return
  if (Date.now() - lastSoundAt < 2000) return
  lastSoundAt = Date.now()

  playToneSequence([
    { freq: 523.25, duration: 0.12, volume: 0.35, type: 'sine' }, // C5
    { freq: 659.25, duration: 0.12, volume: 0.35, type: 'sine' }, // E5
    { freq: 783.99, duration: 0.24, volume: 0.4, type: 'sine' },  // G5
  ])
}

