# Changelog

All notable changes and official releases of **UptimeCore** are documented in this file.  
*Todos los cambios notables y versiones oficiales de **UptimeCore** se documentan en este archivo.*

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning (SemVer)](https://semver.org/).

<div align="center">

[English](#-english) • [Español](#-español)

</div>

---

<a name="-english"></a>
## 🌐 English

## [v1.0.1] - 2026-10-21

### 🩹 Maintenance & UI Polish

#### 📐 Standardized Layout & Uptime Bar Homologation
- **Homologated Grid Architecture**: Standardized column boundaries (`300px | 1fr | 500px`) across both Group Headers and child Endpoint Rows.
- **Sleek Uptime Bars**: Increased historical sample resolution to 36 slim, refined bars with proportional height (`22px`), soft rounded corners (`3.5px`), and consistent spacing (`3.5px`), replacing thick stretched blocks with an enterprise NOC appearance.
- **Strict Column Alignment**: Right panel now uses a dedicated multi-slot subgrid (`[Latency/Time] [Badges/Interval] [Status Badge] [Actions] [Chevron]`), ensuring buttons and badges across all rows line up in razor-sharp vertical guides without jitter or stagger.

#### 🔄 State Persistence & Tab Navigation Stability
- **Accordion Persistence**: Open group accordions are now tracked and persisted in `localStorage` (`uptimecore_expanded_groups`). Active groups remain open across background tab switching, browser memory discarding, or manual reloads.
- **Active Endpoint Persistence**: Expanded sensor SLA and latency charts survive tab switches and page refreshes.
- **Scroll Position Restoration**: Window scroll offset is seamlessly recorded and restored across silent SSE reconnects or tab reactivation.
- **Web SSH Session Guard**: Added browser `beforeunload` warning when active SSH sessions are connected, preventing accidental tab closure or background reloads from severing remote shell terminals.

## [v1.0.0] - 2026-10-19

### 🚀 General Availability (First Stable Release)
Foundational release of the enterprise network observability, real-time telemetry, live interactive diagnostic suite, and multi-tab remote administration terminal.

---

### ✨ Features Added

#### 🖥️ Enterprise Web SSH Terminal (SHELL SSH)
- **100% On-Premise Architecture**: Secure WebSocket tunnels connected directly to the local SSH daemon via Go backend (`golang.org/x/crypto/ssh`). Zero external cloud dependencies or telemetry leakage.
- **Ergonomic Multi-Tab Environment**: Manage multiple concurrent SSH sessions to firewalls, routers, switches, and Linux servers in isolated tabs.
- **Corporate Hardware Compatibility (Legacy & Modern)**: Extended cipher suites (AES-GCM, AES-CTR, ChaCha20), Key Exchange (KEX) algorithms (Diffie-Hellman Group 14/16/GEX, ECDH, Curve25519), and Host Key algorithms for enterprise equipment (Palo Alto PAN-OS, Cisco IOS/NX-OS, Fortinet FortiOS, MikroTik RouterOS, and Linux).
- **Interactive Legal Disclaimer & Consent Banner Flow**: Displays the legal acknowledgment prompt (`(yes/no)`) directly inside the terminal canvas with keystroke echo and Enter default.
- **Hybrid Authentication Engine**: Native RFC 4256 Keyboard-Interactive challenge handling with seamless password auto-fill and traditional password callback fallback.
- **Native Keyboard Shortcuts**:
  - `Ctrl + Shift + C`: Copy selected text to system clipboard.
  - `Ctrl + Shift + V`: Paste text into the interactive shell (with safe modal fallback if browser clipboard permissions are restricted).
  - `Ctrl + C`: Send native SIGINT interrupt signal (`\x03`) to the remote process without clearing selection.
- **Floating Context Menu**: Right-click menu for Copy, Paste, Send SIGINT, Clear Terminal, and Reconnect with instant backdrop click-to-dismiss.
- **1-Click Sensor Launch**: Direct connection shortcut pills for any active endpoint registered in the group.

#### 🧰 Live Interactive Diagnostic Suite
- **Paping (TCP Ping)**: Continuous TCP port availability testing with custom interval, timeout, test counts, real-time output stream, and min/avg/max latency summary.
- **Ping (ICMP)**: Native kernel-level ICMP ping probing via raw sockets (`NET_RAW`).
- **Traceroute**: Hop-by-hop network path tracing displaying intermediate router IPs and round-trip times.
- **HTTP & SSL Inspector**: Real-time response header validation and TLS/SSL certificate chain inspection with days-remaining expiration alerts.
- **DNS & Reverse PTR Resolution**: Forward record querying (A, AAAA, CNAME, MX, TXT) and reverse PTR verification.

#### 📊 Core Telemetry & Observability
- **Live Real-Time Streaming via SSE**: State changes and latency metrics pushed via Server-Sent Events with zero manual page refreshing or polling lag.
- **High-Concurrency Engine in Go**: Parallel goroutine execution with temporal jitter dispersion and anti-thundering-herd scheduling to prevent bandwidth saturation during mass probing.
- **Smart Group & Multi-Link Architecture**: Logical aggregation of multiple WAN/VPN links per branch with composite worst-case status calculation (`UP`, `DEGRADED`, `DOWN`).
- **TimescaleDB Time-Series Storage**: Optimized PostgreSQL hypertable storage for latency metrics across `90m`, `3h`, `6h`, `24h`, and `7d` intervals.
- **Full Deep Search**: Instant real-time filtering across Group Names, Endpoint Targets, Descriptions, Custom Tags, Ports, and exact IP addresses with auto-expanding accordions.
- **Visual Tag Organization**: Multi-color tagging system for categorizing infrastructure by location, environment, vendor, or criticality.

#### 🔔 Intelligent Alerting & Notifications
- **Telegram Bot Dispatcher**: Rich HTML formatted alerts with downtime duration, latency details, and multi-chat support.
- **Customizable SMTP / Email**: Dynamic subject templates (`Perdida de Telemetria: {group} - {monitor}`), customizable sender display name (`From:`), and RFC 2047 UTF-8 encoding support.
- **Anti-Flapping & Hysteresis Protection**: Configurable retry thresholds and latency degradation bounds prevent notification storms during intermittent packet loss.
- **Tier 2 Escalation**: Automatically alerts emergency contacts and secondary communication channels if downtime exceeds the configured grace period.
- **Synthesized Audio Alerts**: NOC acoustic notifications with browser auto-unlock and WAV audio fallback.

#### 💾 Operations & Deployment
- **CSV Backup & Migration**: Full export and import of all groups, monitors, and tags with schema validation and conflict resolution.
- **High-Contrast Dark & Light Themes**: Calibrated palettes for 24/7 NOC wall monitors and daylight operations.
- **Full Containerization**: Reproducible deployment in seconds using Docker Compose (TimescaleDB, Redis, Go Backend, React Frontend).

---

### 🐛 Bug Fixes in v1.0.0
- **SSH / Terminal**:
  - Fixed focus stealing when editing credentials (Host, User, Password) in the top bar.
  - Added transparent backdrop overlay to instantly dismiss the context menu on any outside click.
  - Resolved xterm.js lifecycle disposal issue under React 19 StrictMode preventing blank/black screen instances.
  - Switched tab switching isolation to visibility metrics preserving terminal rows and columns calculations.
- **Diagnostics**:
  - Prevented automatic execution of Paping upon opening the diagnostic modal; waits for explicit click.
- **NOC Filters & Views**:
  - Unified filter predicates across Normal, NOC Mosaico, and NOC Tarjetas views.

---

<a name="-español"></a>
## 🇪🇸 Español

## [v1.0.1] - 2026-10-21

### 🩹 Mantenimiento y Refinamiento de Interfaz

#### 📐 Homologación Visual de Cuadritos y Columnas
- **Estructura de Cuadrícula Homologada**: Estandarización de las columnas (`300px | 1fr | 500px`) tanto en la cabecera de grupos como en las filas de cada endpoint.
- **Barras de Uptime Más Esbeltas y Elegantes**: Aumento de la resolución de historial a 36 barras esbeltas y estilizadas con altura calibrada (`22px`), bordes redondeados suaves (`3.5px`) y separación uniforme (`3.5px`), reemplazando los bloques anchos por una estética profesional de grado NOC.
- **Alineación Vertical Perfecta**: El panel derecho ahora utiliza sub-columnas con anchos fijos dedicados (`[Latencia / Hora] [Badges / Intervalo] [Status Badge] [Botones de Acción] [Chevron]`), garantizando que todos los elementos se alineen en guías verticales perfectas sin desplazarse hacia los lados.

#### 🔄 Persistencia de Estado y Estabilidad al Cambiar de Pestaña
- **Persistencia de Acordeones**: Los grupos abiertos se guardan automáticamente en `localStorage` (`uptimecore_expanded_groups`). Los grupos permanecen abiertos incluso si cambias de pestaña, el navegador suspende la página o se recarga con F5.
- **Persistencia de Sensor Activo**: Los paneles de detalle y gráficas SLA de endpoints abiertos se conservan intactos.
- **Restauración de Posición de Scroll**: La altura de desplazamiento de la ventana se preserva en `sessionStorage` y se restaura sin saltos bruscos.
- **Protección de la Shell Web SSH**: Implementación del detector `beforeunload` para advertir al usuario si intenta cerrar o recargar la pestaña mientras hay sesiones SSH conectadas, protegiendo las terminales remotas activas.

## [v1.0.0] - 2026-10-19

### 🚀 Primera Versión Estable (General Availability)
Hito fundacional de la plataforma empresarial de observabilidad, telemetría de red, diagnóstico interactivo en vivo y terminal de administración remota.

---

### ✨ Nuevas Características

#### 🖥️ Terminal Web SSH Empresarial (SHELL SSH)
- **Arquitectura 100% On-Premise**: Túneles WebSocket seguros conectados directamente al demonio SSH local mediante el backend en Go (`golang.org/x/crypto/ssh`). Cero servicios externos o dependencia de nubes.
- **Entorno Multi-Pestaña**: Gestión simultánea de múltiples sesiones SSH concurrentes hacia routers, firewalls, conmutadores y servidores Linux.
- **Compatibilidad Corporativa (Legacy & Modern)**: Negociación ampliada de suites de cifrado (AES-GCM, AES-CTR, ChaCha20), algoritmos de intercambio de claves KEX (Diffie-Hellman Group 14/16/GEX, ECDH, Curve25519) y algoritmos de llave de host para equipos empresariales (Palo Alto PAN-OS, Cisco IOS/NX-OS, Fortinet, MikroTik y Linux).
- **Manejo Interactivo de Banners Legales**: Presentación del aviso de consentimiento (`(yes/no)`) directamente en el lienzo de la terminal con soporte de entrada interactiva y valor por defecto en Enter.
- **Autenticación Híbrida**: Soporte nativo para Keyboard-Interactive (RFC 4256) con relleno automático de contraseñas y fallback tradicional.
- **Atajos de Teclado Nativos**:
  - `Ctrl + Shift + C`: Copiar texto seleccionado al portapapeles del sistema.
  - `Ctrl + Shift + V`: Pegar texto en la shell interactiva con modal fallback de seguridad.
  - `Ctrl + C`: Envío nativo de la señal de interrupción SIGINT (`\x03`) hacia el proceso remoto.
- **Menú Contextual Flotante**: Clic derecho con opciones rápidas de copiar, pegar, interrumpir, limpiar pantalla y reconectar, con telón transparente de cierre instantáneo.
- **Lanzador Rápido de Sensores**: Conexión en 1 clic hacia cualquier IP o puerto de los sensores registrados en el grupo.

#### 🧰 Suite de Diagnóstico Interactivo en Vivo
- **Paping (TCP Ping)**: Pruebas continuas de conectividad a puertos TCP específicos con métricas en tiempo real de latencia mínima, promedio, máxima y porcentaje de pérdida.
- **Ping (ICMP)**: Sondeo ICMP nativo a nivel de kernel mediante sockets crudos (`NET_RAW`).
- **Traceroute**: Trazado salto a salto de la ruta de red con identificación de saltos intermedios y latencias RTT.
- **Analizador HTTP & SSL**: Inspección de códigos de estado, cabeceras de respuesta y tiempo de expiración de certificados TLS/SSL.
- **DNS & PTR Inverso**: Resolución de registros directos (A, AAAA, MX, CNAME, TXT) y verificación inversa de direcciones IP.

#### 📊 Telemetría y Observabilidad Central
- **Transmisión en Vivo por SSE (Server-Sent Events)**: Difusión de cambios de estado y latencias en tiempo real sin recargas manuales (`F5`) ni demoras de polling.
- **Motor Concurrente en Go**: Ejecución paralela basada en goroutines con dispersión de jitter temporal y control de avalanchas (*anti-thundering-herd*).
- **Arquitectura de Grupos Multienlace**: Agregación lógica de múltiples enlaces WAN/VPN por sucursal con cálculo de peor caso (`UP`, `DEGRADADO`, `DOWN`).
- **Series Temporales en TimescaleDB**: Almacenamiento optimizado en hipertablas para consultas de latencia e historial en rangos de `90m`, `3h`, `6h`, `24h` y `7d`.
- **Búsqueda Profunda Global**: Filtro en tiempo real por nombre de cliente, descripción, tags, puertos y direcciones IP exactas.
- **Sistema de Etiquetas Visuales**: Clasificación multidimensional por colores para identificar sedes, entornos y criticidad.

#### 🔔 Sistema Inteligente de Alertas y Notificaciones
- **Bot de Telegram**: Notificaciones enriquecidas en HTML con duración de la caída, latencias y soporte para múltiples chats.
- **Servicio SMTP / Email Personalizable**: Asuntos dinámicos basados en plantillas (`Perdida de Telemetria: {group} - {monitor}`), nombre de remitente configurable (`From:`) y codificación RFC 2047 UTF-8.
- **Protección Anti-Flapping e Histéresis**: Umbrales configurables de reintentos antes de disparar falsos positivos por microcortes.
- **Escalamiento Nivel 2**: Despacho automático a contactos de emergencia si la indisponibilidad excede el tiempo de gracia estipulado.
- **Alertas Sonoras Sintetizadas**: Notificaciones acústicas en cabina NOC con audio desbloqueado y fallback WAV.

#### 💾 Operaciones y Plataforma
- **Respaldo y Migración en CSV**: Exportación e importación completa de grupos, sensores y etiquetas con reporte de validación.
- **Modos Oscuro y Claro**: Paletas de alto contraste calibradas para pantallas de monitoreo 24/7 y estaciones de trabajo.
- **Contenedorización Completa**: Despliegue reproducible en segundos mediante Docker Compose (TimescaleDB, Redis, Go Backend, React Frontend).

---

### 🐛 Correcciones Incluidas en v1.0.0
- **SSH / Terminal**:
  - Corrección de robo de foco involuntario al editar los campos de Host, Usuario o Clave.
  - Corrección del menú contextual flotante para cerrarse inmediatamente ante cualquier clic normal en la pantalla.
  - Corrección del ciclo de vida xterm.js bajo React 19 StrictMode evitando instancias desechadas o pantallas negras.
  - Aislamiento de pestañas inactivas mediante visibilidad para preservar métricas reales de filas y columnas.
- **Diagnósticos**:
  - Corrección de ejecución automática no deseada de Paping al abrir la ventana modal.
- **Filtros y Vistas NOC**:
  - Unificación de predicados de filtrado entre vista Normal, Mosaico NOC y Tarjetas NOC.
