/**
 * components/UptimeCoreLogo.tsx
 * Logotipo oficial de UptimeCore: "The Orbit Core"
 * Simboliza el bucle continuo 360° de uptime con radar de telemetría y núcleo activo.
 */
import React from 'react'

interface UptimeCoreLogoProps {
  size?: number
  className?: string
  withContainer?: boolean
}

export const UptimeCoreLogo: React.FC<UptimeCoreLogoProps> = ({
  size = 34,
  className = '',
  withContainer = true,
}) => {
  const svgContent = (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: withContainer ? '72%' : size, height: withContainer ? '72%' : size, display: 'block' }}
    >
      <defs>
        <linearGradient id="uptimeCoreOrbitGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="45%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <radialGradient id="uptimeCoreGlow" cx="24" cy="24" r="9" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Resplandor del núcleo */}
      <circle cx="24" cy="24" r="9" fill="url(#uptimeCoreGlow)" />

      {/* Anillo orbital exterior 360° con corte dinámico */}
      <circle
        cx="24"
        cy="24"
        r="17.5"
        stroke="url(#uptimeCoreOrbitGrad)"
        strokeWidth="4.2"
        strokeDasharray="88 22"
        strokeLinecap="round"
      />

      {/* Órbita concéntrica de radar / telemetría */}
      <circle
        cx="24"
        cy="24"
        r="10.5"
        stroke="#38bdf8"
        strokeWidth="1.8"
        strokeDasharray="4 4"
        strokeOpacity="0.65"
      />

      {/* Núcleo activo (Heartbeat / Ping OK) */}
      <circle cx="24" cy="24" r="4.8" fill="#22c55e" />
      <circle cx="25.5" cy="22.5" r="1.5" fill="#ffffff" fillOpacity="0.9" />
    </svg>
  )

  if (!withContainer) {
    return (
      <div className={className} style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {svgContent}
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        boxShadow: '0 2px 10px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {svgContent}
    </div>
  )
}
