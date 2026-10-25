import React, { useEffect, useRef } from 'react'

interface RipplePoint {
  x: number
  y: number
  time: number
  strength: number
}

export const AsciiOceanCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  
  const mouseRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 960,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 450,
    prevX: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 960,
    prevY: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 450,
    speed: 0,
    targetX: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 960,
    targetY: typeof window !== 'undefined' ? window.innerHeight * 0.45 : 450,
    active: false,
    lastRippleTime: 0,
  })

  const ripplesRef = useRef<RipplePoint[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = 0
    let height = 0

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now() * 0.001
      const m = mouseRef.current
      
      const dx = e.clientX - m.targetX
      const dy = e.clientY - m.targetY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      m.targetX = e.clientX
      m.targetY = e.clientY
      m.active = true

      // Generar ondas físicas que se propagan al mover el cursor rápidamente
      if (dist > 18 && (now - m.lastRippleTime > 0.07)) {
        m.lastRippleTime = now
        const speedStrength = Math.min(dist * 0.04, 1.8)
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          time: now,
          strength: 0.8 + speedStrength,
        })

        // Mantener como máximo 8 ondas activas simultáneas
        if (ripplesRef.current.length > 8) {
          ripplesRef.current.shift()
        }
      }
    }

    const handleMouseLeave = () => {
      mouseRef.current.active = false
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0]
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchstart', handleTouchMove, { passive: true })
    document.addEventListener('mouseleave', handleMouseLeave)

    const startTime = performance.now()

    // Paletas jerárquicas de caracteres ASCII según la altura y turbulencia del agua
    const CHURN_FOAM = ['@', '#', '%', '&', '*', '^', '≈']
    const CREST_FOAM = ['^', '≈', '~', '*', '°', '%', '∆', '^']
    const WATER_SLOPE = ['~', '≈', '=', '~', '≈', '-']
    const WATER_BODY = ['~', '-', '~', '-', '~']
    const WATER_TROUGH = ['_', '·', '.', '_', '·']

    const render = (time: number) => {
      const t = (time - startTime) * 0.001 // Tiempo en segundos

      const m = mouseRef.current
      // Inercia suave del puntero (lerp)
      const curX = m.x + (m.targetX - m.x) * 0.12
      const curY = m.y + (m.targetY - m.y) * 0.12
      
      const moveDist = Math.sqrt((curX - m.prevX) ** 2 + (curY - m.prevY) ** 2)
      m.speed = m.speed * 0.85 + moveDist * 0.15
      m.prevX = m.x
      m.prevY = m.y
      m.x = curX
      m.y = curY

      // Descartar ondas viejas (> 2.4 segundos de vida)
      ripplesRef.current = ripplesRef.current.filter((rip) => t - rip.time < 2.4)

      ctx.clearRect(0, 0, width, height)

      // Línea de horizonte situada al 16% de la altura de pantalla
      const horizonY = height * 0.16
      const oceanSpan = height - horizonY

      // 1. Cielo nocturno con estrellas ASCII titilantes
      ctx.font = '10px "JetBrains Mono", Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const starStep = 55
      const numStars = Math.floor(width / starStep)
      for (let s = 0; s < numStars; s++) {
        const sx = (s * starStep + 28) % width
        const sy = (s * 33.7 + 15) % horizonY
        const twinkle = Math.sin(t * 1.8 + s * 1.5) * 0.5 + 0.5
        const char = twinkle > 0.75 ? '+' : twinkle > 0.35 ? '·' : '.'
        ctx.fillStyle = `rgba(148, 163, 184, ${0.05 + twinkle * 0.15})`
        ctx.fillText(char, sx, sy)
      }

      // 2. Línea continua de horizonte
      ctx.font = '9px "JetBrains Mono", Consolas, monospace'
      const hCharWidth = 10
      const hCols = Math.ceil(width / hCharWidth) + 1
      for (let c = 0; c < hCols; c++) {
        const hx = c * hCharWidth
        const hWave = Math.sin(hx * 0.012 + t * 0.9) * 0.7
        ctx.fillStyle = 'rgba(71, 85, 105, 0.28)'
        ctx.fillText('-', hx, horizonY + hWave)
      }

      // 3. Mar horizontal 3D con interacción física
      const depthRows = 54
      const charWidth = 10.5
      const cols = Math.ceil(width / charWidth) + 1

      const mouseX = m.x
      const mouseY = m.y
      const mouseActive = m.active
      const activeRipples = ripplesRef.current
      const hasRipples = activeRipples.length > 0

      // Renderizamos de atrás hacia adelante para la perspectiva
      for (let r = depthRows; r >= 1; r--) {
        const zNorm = 1 - (r / depthRows) // 0 (horizonte) a 1 (primer plano)
        const rowBaseY = horizonY + Math.pow(zNorm, 1.58) * oceanSpan
        const baseAmp = zNorm * 18 + 1.2

        const waveSpeed = t * 1.7
        const rowPhase = r * 0.38

        const fontSize = Math.max(9, Math.floor(zNorm * 5 + 9))
        ctx.font = `${fontSize}px "JetBrains Mono", Consolas, monospace`

        for (let c = 0; c < cols; c++) {
          const x = c * charWidth

          // Oleaje oceánico ambiental multi-sinusoidal:
          const swell = Math.sin(x * 0.009 + rowPhase - waveSpeed)
          const crossChop = Math.sin(x * 0.022 - t * 1.1 + r * 0.25) * 0.42
          const ripple = Math.cos(x * 0.045 + t * 0.85 + r * 0.12) * 0.2

          let elevation = swell + crossChop + ripple
          let interactionFactor = 0

          // INTERACCIÓN 1: Proximidad radial directa al cursor
          if (mouseActive) {
            const dx = x - mouseX
            const dy = rowBaseY - mouseY
            const distSq = dx * dx + dy * dy
            const hoverRadius = 240 + zNorm * 60

            if (distSq < hoverRadius * hoverRadius) {
              const dist = Math.sqrt(distSq)
              const proximity = 1 - (dist / hoverRadius)
              const cursorWave = Math.sin(dist * 0.055 - t * 5.5) * proximity * 1.4
              elevation += cursorWave
              interactionFactor = Math.max(interactionFactor, proximity)
            }
          }

          // INTERACCIÓN 2: Ondas circulares expansivas físicas (Ripples)
          if (hasRipples) {
            for (let i = 0; i < activeRipples.length; i++) {
              const rip = activeRipples[i]
              const age = t - rip.time
              if (age <= 0) continue

              const rdx = x - rip.x
              const rdy = rowBaseY - rip.y
              const rdistSq = rdx * rdx + rdy * rdy

              const waveRadius = age * 260 // velocidad de expansión px/s
              const maxDist = waveRadius + 70
              const minDist = Math.max(0, waveRadius - 70)

              if (rdistSq < maxDist * maxDist && rdistSq > minDist * minDist) {
                const rdist = Math.sqrt(rdistSq)
                const frontDist = Math.abs(rdist - waveRadius)
                if (frontDist < 60) {
                  const frontWeight = (1 - frontDist / 60)
                  const decay = Math.exp(-age * 1.15) * rip.strength
                  const ripDisplacement = Math.sin(frontDist * 0.12) * frontWeight * decay * 1.6
                  elevation += ripDisplacement
                  interactionFactor = Math.max(interactionFactor, frontWeight * decay * 0.9)
                }
              }
            }
          }

          const finalAmp = baseAmp * (1 + interactionFactor * 0.85)
          const posY = rowBaseY - elevation * finalAmp

          let char = '~'
          let fillStyle = ''

          if (interactionFactor > 0.45) {
            // Agua fuertemente agitada por el cursor (espuma esmeralda neón)
            const idx = (c * 3 + r * 5 + Math.floor(t * 12)) % CHURN_FOAM.length
            char = CHURN_FOAM[idx]
            const alpha = Math.min(0.95, 0.4 + interactionFactor * 0.55)
            fillStyle = `rgba(16, 185, 129, ${alpha})`
          } else if (elevation > 0.85) {
            // Crestas altas de olas y espuma natural (cian / esmeralda suave)
            const idx = Math.floor((Math.abs(Math.sin(x * 0.08 + t)) * CREST_FOAM.length)) % CREST_FOAM.length
            char = CREST_FOAM[idx]
            const alpha = Math.min(0.9, 0.22 + zNorm * 0.38 + interactionFactor * 0.4)
            fillStyle = interactionFactor > 0.15 
              ? `rgba(52, 211, 153, ${alpha})` 
              : `rgba(56, 189, 248, ${alpha})`
          } else if (elevation > 0.2) {
            // Pendiente media ascendente
            const idx = (c + r) % WATER_SLOPE.length
            char = WATER_SLOPE[idx]
            const alpha = Math.min(0.75, 0.14 + zNorm * 0.24 + interactionFactor * 0.3)
            fillStyle = interactionFactor > 0.15 
              ? `rgba(14, 165, 233, ${alpha})` 
              : `rgba(56, 189, 248, ${alpha})`
          } else if (elevation > -0.55) {
            // Cuerpo del agua
            const idx = (c + r * 2) % WATER_BODY.length
            char = WATER_BODY[idx]
            const alpha = Math.min(0.5, 0.08 + zNorm * 0.16 + interactionFactor * 0.2)
            fillStyle = interactionFactor > 0.15 
              ? `rgba(56, 189, 248, ${alpha})` 
              : `rgba(100, 116, 139, ${alpha})`
          } else {
            // Valles profundos y senos de ola (pizarra oscura)
            const idx = (c + r * 3) % WATER_TROUGH.length
            char = WATER_TROUGH[idx]
            const alpha = Math.min(0.35, 0.04 + zNorm * 0.1)
            fillStyle = `rgba(71, 85, 105, ${alpha})`
          }

          ctx.fillStyle = fillStyle
          ctx.fillText(char, x, posY)
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchstart', handleTouchMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  )
}
