# Changelog

Todos los cambios notables y versiones oficiales de **UptimeCore** se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning (SemVer)](https://semver.org/lang/es/).

---

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
