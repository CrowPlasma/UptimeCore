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

## [v1.0.4] - 2026-10-21

### 🏢 Corporate Entity Branding & Text Visibility

#### 🏛️ Custom Entity Identity in Navbar & System Settings
- **New "Entidad" (Organization) Settings Tab**: Added an enterprise branding tab in the System Settings modal allowing operators to customize their organization name and logo.
- **Direct Image Upload & URL Support**: Supports both external logo image URLs and direct local file uploads (PNG, SVG, JPG, WebP) with client-side validation, live navbar simulation preview, and an instant logo removal button.
- **Centered Navbar Brand Placement**: Dynamically renders the configured organization logo and name precisely in the horizontal center of the top navigation bar (`position: absolute; left: 50%; transform: translateX(-50%)`), updating in real-time across the app without requiring a page reload.

#### 📐 Balanced Group Row Spacing & Unclipped Text Visibility
- **Calibrated Identity Column (`350px`)**: Expanded the group name and endpoint description column from `280px` to a balanced `350px` with optimized padding, eliminating awkward text truncation (`...`) on long site names and comprehensive contact information (`Name - email@domain.com phone`).
- **Left-Aligned Status Squares**: Reduced excessive spacing between label text and the status squares by ~100px, keeping historical uptime bars sleek, compact, and ergonomically aligned towards the left while preventing clutter.
- **Full-Text Native Tooltips**: Added contextual `title` tooltips across all group headers, monitor names, and targets for effortless hover inspection of unclipped data.

## [v1.0.3] - 2026-10-21

### 📐 UI Architecture & NOC Ergonomics

#### 📊 Dedicated Endpoints Metric Card & Balanced KPI Grid
- **New Endpoints KPI Card**: Added a dedicated "Endpoints" metric card at the top displaying total monitored endpoints and real-time operational breakdown (`UP` vs `DOWN`).
- **Square-Proportioned Metric Cards**: Refactored top status cards into balanced, sturdy KPI cards (72px height) featuring clear uppercase headers, colored icon badges, large JetBrains Mono counters, and live contextual sublabels.
- **Accurate Mutually-Exclusive Counters**: Audited and confirmed group and endpoint status counting logic to ensure 100% mathematical consistency without overlap.

#### 🎛️ Unified Right-Aligned Controls & Global Live Telemetry
- **Right-Aligned Operations Hub**: Consolidating all operational tools and filters (`Expand/Collapse`, `Tag Filter`, `Down First`, `Bitácora`, `Diagnostic Console`, `NOC Wallboard`, `Sound Alert`, `Sync`, and `New Group`) into a cohesive cluster on the right, giving the search bar clean, dedicated space on the left.
- **Single Smart Expand/Collapse Toggle**: Replaced dual buttons with a single dynamic toggle button that intelligently switches between "Expand all" and "Collapse all" with a live count badge of expanded groups.
- **Navbar Live Heartbeat Relocation**: Moved the real-time SSE streaming clock (`● EN VIVO`) to the main top navigation bar beside the settings gear, optimizing vertical space on the dashboard while keeping live connectivity status permanently in view across all views.

## [v1.0.2] - 2026-10-21

### ⚡ Performance & Ergonomics

#### 🎨 Instantaneous Theme Switching (Zero-Jank Mode)
- **CSS Transition-Pause Technique**: Eliminated transition lag across 5,000+ DOM nodes when toggling between Dark and Light mode. A temporary style lock suppresses style interpolation during the paint phase, enabling instant (0ms / 1-frame) theme transitions.
- **Selective CSS Transitions**: Constrained transition properties to specific style targets (`color`, `background-color`, `border-color`) instead of broad `transition: all`, avoiding massive bulk repaints.

#### 📂 Global Expand All / Collapse All Controls
- **Bulk Accordion Controls**: Added dedicated "Expand all" and "Collapse all" action buttons directly beneath the global search bar.
- **Dynamic Group Counter**: Displays real-time counts of currently expanded groups (`X of Y expandidos`).
- **Synchronized Persistence**: Expanding or collapsing all groups automatically syncs with `localStorage` so preferred view state persists across reloads and tab navigation.

#### 🏷️ Visible App Versioning & Extended Tag Palette
- **Omnipresent Version Indicators**: Added discrete `v1.0.2` badge pills in the primary Navbar next to the logo, inside the "Ajustes del Sistema" modal header and sidebar footer, and in the bottom status line.
- **Extended Tag Color Swatches & Pipette Tool**: Expanded the tag creation palette from 8 to 24 rich enterprise colors across the full spectrum (Indigos, Cyans, Emeralds, Ambers, Roses, Slates), along with a native color wheel picker (`Pipette`) for choosing custom HEX colors.

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

## [v1.0.4] - 2026-10-21

### 🏢 Identidad de Entidad Corporativa y Visibilidad de Textos

#### 🏛️ Branding de Entidad en Navbar y Ajustes del Sistema
- **Nueva Pestaña "Entidad" en Ajustes**: Se incorporó una pestaña dedicada en el modal de Ajustes del Sistema para configurar el nombre y logotipo de la empresa u organización.
- **Subida de Archivos Directa y Soporte para URLs**: Permite vincular imágenes mediante URL o cargar archivos directamente desde el equipo local (PNG, SVG, JPG, WebP) con vista previa en tiempo real y botón para remover el logotipo.
- **Emblema Centrado en la Barra Superior**: Muestra el nombre y logotipo de la organización exactamente en el centro de la barra de navegación (`position: absolute; left: 50%; transform: translateX(-50%)`), sincronizándose al instante al guardar sin necesidad de recargar la página.

#### 📐 Espaciado Equilibrado y Eliminación de Textos Cortados
- **Columna de Identidad Calibrada (`350px`)**: Se amplió el ancho de la columna de nombres y descripciones de `280px` a `350px` con padding optimizado, eliminando el corte con tres puntos (`...`) en nombres largos de sitios y datos completos de contacto (`Nombre - correo@empresa.com teléfono`).
- **Cuadros de Estado Más Cercanos a la Izquierda**: Se redujo en ~100px el espacio vacío entre el texto descriptivo y las barras de estado (`UptimeBar`), logrando una disposición más compacta, profesional y ergonómica.
- **Tooltips Nativos de Texto Completo**: Se añadieron atributos `title` en todos los nombres de grupo, descripciones, monitores y destinos para facilitar la lectura inmediata al pasar el cursor.

## [v1.0.3] - 2026-10-21

### 📐 Arquitectura de Interfaz y Ergonomía NOC

#### 📊 Tarjeta Dedicada de Endpoints y Cuadrícula KPI Equilibrada
- **Nueva Tarjeta de Métricas para Endpoints**: Se incorporó una tarjeta dedicada para "Endpoints" en el bloque superior, mostrando el total de sensores monitoreados y su desglose operativo en vivo (`UP` vs `DOWN`).
- **Tarjetas de Estado Cuadradas y Proporcionadas**: Rediseño de las tarjetas a una altura equilibrada (72px), con encabezados en mayúsculas, insignias de icono con color de estado, cifras grandes en fuente JetBrains Mono y subtítulos contextuales en tiempo real.
- **Conteo Matemático Riguroso**: Validación y blindaje del algoritmo de conteo para garantizar que cada grupo pertenezca a su estado exclusivo sin duplicidades.

#### 🎛️ Barra de Controles Alineada a la Derecha y Telemetría Global
- **Centro de Controles Agrupado a la Derecha**: Reubicación de todas las herramientas de operación y filtros (`Expandir/Colapsar`, `Filtro de Estado`, `Caídos 1º`, `Bitácora`, `Consola de Diagnóstico`, `Modo NOC`, `Alerta Sonora`, `Sync` y `Nuevo Grupo`) en un bloque compacto a la derecha, dejando la barra de búsqueda con espacio despejado y limpio a la izquierda.
- **Botón Inteligente Único de Expandir/Colapsar**: Fusión de los dos botones anteriores en un solo botón toggle dinámico que alterna entre "Expandir todo" y "Colapsar todo", acompañado de un micro-contador con la cantidad de acordeones abiertos.
- **Reloj de Telemetría "EN VIVO" en la Barra Superior**: Traslado del indicador de conexión en tiempo real (`● EN VIVO`) al Navbar principal junto al engrane de ajustes, recuperando valioso espacio vertical en el tablero y manteniendo visible el pulso del sistema en cualquier sección.

## [v1.0.2] - 2026-10-21

### ⚡ Rendimiento y Ergonomía

#### 🎨 Cambio de Tema Instantáneo (Sin Congelamiento)
- **Técnica de Pausa de Transición CSS**: Se eliminó el retraso al alternar entre modo oscuro y claro generado por el cálculo simultáneo de transiciones sobre más de 5,000 nodos del DOM (barras de uptime, botones y tarjetas). Se aplica un bloqueo temporal de transición durante el repintado, permitiendo un cambio inmediato (0ms / 1 frame).
- **Transiciones Selectivas**: Se acotaron las transiciones globales a propiedades específicas (`color`, `background-color`, `border-color`) en lugar de `transition: all`, evitando recálculos pesados en masa.

#### 📂 Botones Globales "Expandir todos" y "Colapsar todos"
- **Control Masivo de Acordeones**: Incorporación de botones dedicados para "Expandir todos" y "Colapsar todos" ubicados estratégicamente justo debajo de la barra de búsqueda.
- **Contador Dinámico en Vivo**: Muestra en tiempo real la cantidad de grupos expandidos respecto al total visible (`X de Y expandidos`).
- **Persistencia Sincronizada**: Las acciones masivas de expansión y colapso se sincronizan automáticamente con `localStorage` preservando el estado de la vista al recargar o cambiar de pestaña.

#### 🏷️ Indicadores Visibles de Versión y Paleta Extendida de Etiquetas
- **Identificadores de Versión en Toda la App**: Incorporación de insignias discretas `v1.0.2` en la barra de navegación principal junto al logotipo, en la cabecera y barra lateral de "Ajustes del Sistema", y en el pie de página de estado.
- **Paleta de Colores Extendida y Selector con Pipeta**: Se amplió la paleta de creación de etiquetas de 8 a 24 colores empresariales distribuidos en todo el espectro visual (azules, cyanes, esmeraldas, ámbar, rosas, pizarras), complementada con un selector de rueda de color nativo (`Pipeta`) para seleccionar cualquier tono HEX personalizado.

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
