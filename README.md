# 🚀 UptimeCore

<div align="center">

**Enterprise Network Monitoring, Real-Time Observability & Diagnostic Platform**  
*Plataforma Empresarial de Monitoreo de Redes, Observabilidad y Diagnóstico en Tiempo Real*

[English](#-english) • [Español](#-español)

[![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)](https://github.com/CrowPlasma/UptimeCore)
[![Go](https://img.shields.io/badge/Backend-Go_Fiber-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-FDB515?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis_7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Deployment-Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](LICENSE)

</div>

---

<a name="-english"></a>
## 🌐 English

### Overview
**UptimeCore** is a modern, high-concurrency network monitoring, telemetry, and live diagnostic platform designed from the ground up for Network Engineers, DevOps, SysAdmins, and NOC Operations teams.

It pairs a sub-second asynchronous probing engine in **Go (Fiber + Goroutines)** with an ultra-fast, responsive **React 19** single-page application streamed in real time via **Server-Sent Events (SSE)**. It provides a complete diagnostic suite, including a full-featured, zero-cloud **Multi-Tab Web SSH Terminal** compatible with enterprise hardware (Palo Alto, Cisco, Fortinet, MikroTik, Linux).

---

### ✨ Key Features Matrix

#### 📊 1. Core Observability & Telemetry
- **⚡ Live Real-Time Dashboard (SSE)**: Instant latency, uptime, and status streaming via Server-Sent Events. Zero manual page refreshing or polling lag.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/7a793349-41fd-4488-912e-e5c25d74bdfd" />
- **🚀 High-Concurrency Engine in Go**: Parallel goroutine execution with jitter dispersion and anti-thundering-herd scheduling to prevent bandwidth saturation during mass probing.
- **🔗 Smart Group & Multi-Link Architecture**: Model multi-homed routers, redundant firewalls, and branch offices with multiple WAN/VPN links. Automatic group status aggregation (`UP`, `DEGRADED`, `DOWN`) with worst-case composite timeline bars.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/af1c74f2-1122-4852-84b9-b84bb4806de6" />
- **📈 TimescaleDB Time-Series History**: Backed by PostgreSQL hypertables. Inspect latency metrics, uptime ratios, and failure logs across flexible time ranges (`90m`, `3h`, `6h`, `24h`, `7d`).
  <img width="1854" height="494" alt="image" src="https://github.com/user-attachments/assets/6556c237-b525-4030-80fa-3bb3e1a99698" />
- **🔍 Full Deep Search**: Instant search across Group Names, Endpoint Targets, Descriptions, Custom Tags, Ports, or exact IP addresses with auto-expanding accordions.
  <img width="231" height="225" alt="image" src="https://github.com/user-attachments/assets/8aceaf68-294f-4104-bd80-18b6213ce2c4" />
- **🏷️ Tag Organization**: Multi-color tagging system for organizing infrastructure by location, environment, vendor, or criticality.

---

#### 📶 2. Multi-Protocol Probing Engine
- **ICMP Ping**: Native raw socket kernel-level pings (`NET_RAW`) with precise millisecond latency and packet drop detection.
- **TCP / TCP_PING**: Socket handshake validation and port availability for services that block ICMP (e.g., firewalls, proprietary ports).
- **HTTP / HTTPS**: Full response validation, HTTP status code checks (2xx, 3xx, 4xx, 5xx), redirect following, and connection timing.
- **SSL / TLS Certificate Monitoring**: Proactive certificate expiration alerts, issuer identification, and days remaining warnings.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/dea91b0a-4353-4462-a5f8-362a0707456f" />

---

#### 🧰 3. Live Interactive Diagnostic Suite
Directly accessible from any group or monitor card with 1-click presets:
- **🌐 Paping (TCP Ping)**: Live interactive port check with configurable interval, timeout, test counts, real-time output stream, and min/avg/max latency summary.
- **📡 Ping (ICMP)**: On-demand live ICMP stream to diagnose connectivity without leaving the browser.
- **🗺️ Traceroute**: Hop-by-hop network path tracing displaying intermediate router IPs and round-trip times.
- **🔒 HTTP & SSL Inspector**: Instant SSL certificate chain inspection, validity period, and HTTP response headers.
- **🔎 DNS & Reverse PTR Resolution**: Forward record querying (A, AAAA, CNAME, MX, TXT) and reverse PTR verification.

---

#### 🖥️ 4. Enterprise Web SSH Terminal (SHELL SSH)
A zero-cloud, 100% on-premise terminal emulator built on **xterm.js** and Go WebSocket tunnels:
- **🗂️ Multi-Tab Ergonomics**: Open, manage, and toggle multiple simultaneous SSH sessions across different devices in separate tabs.
- **🏢 Enterprise Hardware Compatibility**: Extended cipher suites, Key Exchange (KEX) algorithms, and MACs compatible with modern and legacy appliances (Palo Alto PAN-OS, Cisco IOS/NX-OS, Fortinet FortiOS, MikroTik RouterOS, and Linux).
- **📝 Interactive Banner & Authentication Flow**:
  - Handles legal disclaimers and consent banners (`(yes/no)` prompt) **interactively directly inside the terminal canvas** (identical to PuTTY and MobaXterm).
  - Keyboard-Interactive (RFC 4256) and Password fallback authentication.
  - Auto-fills password upon banner acceptance when credentials are provided in the top bar.
- **⌨️ Native Keyboard Shortcuts**:
  - `Ctrl + Shift + C`: Copy selected text to clipboard.
  - `Ctrl + Shift + V`: Paste text into the shell (with safe modal fallback if browser clipboard permissions are restricted).
  - `Ctrl + C`: Dispatches remote SIGINT interrupt signal (`\x03`) to the remote process.
- **🖱️ Floating Context Menu**: Right-click menu for Copy, Paste, Send SIGINT, Clear Terminal, and Reconnect with instant backdrop click-to-dismiss.
- **⚡ 1-Click Sensor Launch**: Shortcut buttons to instantly connect to any active endpoint in the group.

---

#### 🔔 5. Intelligent Alerting & Notifications
- **📱 Telegram Bot Dispatcher**: Rich HTML formatting with status indicators, downtime duration, latency details, and multi-chat support.
- **📧 Customizable SMTP / Email**: 
  - Dynamic subject templates (`Perdida de Telemetria: {group} - {monitor}`).
  - Customizable sender display name (`From:`) with RFC 2047 UTF-8 support.
  - Compatible with Google Workspace / Gmail App Passwords and corporate relay servers with STARTTLS.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/bea4140e-d468-41f5-8358-15d0f062e481" />
- **🛡️ Anti-Flapping & Hysteresis**: Configurable retry thresholds and latency degradation bounds prevent notification storms during intermittent packet loss.
- **🚨 Tier 2 Escalation**: Automatically alerts emergency contacts and secondary communication channels if an outage exceeds the configured grace window (e.g., 30 minutes).

---

#### 🔐 6. Role-Based Access Control (RBAC) & Authentication
- **🛡️ 3-Tier Security Hierarchy**:
  - `admin`: Full system control, user lifecycle management, entity branding, and monitor configuration.
  - `helpdesk`: Operational control over live diagnostics, Web SSH terminal, maintenance modes, and monitor pauses. Prevented from editing or deleting infrastructure.
  - `viewer`: Read-only NOC telemetry and SLA report generation. Diagnostic and execution tools are hidden and API-guarded with HTTP 403.
- **🌊 Interactive 3D ASCII Ocean Login**: High-performance canvas ocean simulation reacting dynamically to cursor and touch movement with physical wave ripple mechanics.
- **🔒 Enterprise Security**: User passwords hashed with `bcrypt`, strict 6-character validation, and server-side safeguards preventing self-lockout or deletion of the last remaining administrator.
- **🖥️ 24/7 Unattended NOC Display Persistence**: Indefinite session token persistence in `localStorage` and Redis AOF ensures wallboard monitors never timeout.

---

#### 🧹 7. Rolling 90-Day Telemetry Retention & Analytics
- **Automated Cyclic Downsampling**: Background cleaner goroutine purges time-series telemetry older than 90 days every 6 hours, maintaining optimal database performance.
- **Live Retention Health**: Real-time record counts, oldest telemetry dates, and on-demand purge controls inside System Settings.

---

#### 💾 8. Operations, Backup & UI
- **💾 CSV Backup & Restore**: Full export and import of all groups, monitors, and tags with schema validation and conflict resolution.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/e8ef57c9-fdd3-4c16-9f3c-fc807155e6b5" />
- **🌓 High-Contrast Dark & Light Themes**: Specially calibrated themes for 24/7 NOC wall monitors and daylight environments.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/d541c738-2938-4ca2-8fce-2f15367b90f8" />
- **🔒 100% On-Premise & Privacy**: Zero third-party telemetry, cloud dependencies, or data leakage. Runs entirely within your Docker network.

---

### 🛠️ Architecture & Tech Stack

```text
┌─────────────────┐       SSE (Live Stream)       ┌────────────────────────┐
│  React 19 SPA   │ ◄───────────────────────────  │    Go Fiber Engine     │
│  Zustand + Vite │ ────────── REST API ────────► │ (Goroutine Schedulers) │
│ xterm.js WebSSH │ ◄════════ WebSockets ═══════► │ (SSH Terminal PTY)     │
└─────────────────┘                               └───────────┬────────────┘
                                                              │
                                      ┌───────────────────────┴───────────────────────┐
                                      ▼                                               ▼
                         ┌─────────────────────────┐                     ┌─────────────────────────┐
                         │   TimescaleDB (pgx)     │                     │     Redis Cache         │
                         │ (Hypertable Time-Series)│                     │ (Sub-ms Live State)     │
                         └─────────────────────────┘                     └─────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite, Zustand, xterm.js, Lucide Icons.
- **Backend**: Go (Golang 1.23), Fiber v2, pgx v5, go-redis, golang.org/x/crypto/ssh.
- **Storage**: TimescaleDB (PostgreSQL 16) + Redis 7.
- **Deployment**: Docker Compose, Dockge, Portainer.

---

### 🚀 Quick Start Deployment

#### 1. Clone the repository
```bash
git clone https://github.com/CrowPlasma/UptimeCore.git
cd UptimeCore
```

#### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Customize your credentials (`DB_USER`, `DB_PASSWORD`, `REDIS_PASSWORD`, etc.).

#### 3. Launch with Docker Compose
```bash
docker compose up -d --build
```

#### 4. Access the Dashboard
Open your browser at:
```text
http://<server-ip>:5173
```
*(Or point your reverse proxy / NGINX / Traefik to port `5173` for frontend and `/api` to port `8080`).*

Sign in with the seeded administrator account:
- **Default Username**: `admin`
- **Default Password**: `admin123`
*(Remember to update or reset default credentials under **Settings > Security & Users** upon initial deployment).*

---

<a name="-español"></a>
## 🇪🇸 Español

### Descripción General
**UptimeCore** es una plataforma moderna de monitoreo de redes, telemetría y diagnóstico en vivo diseñada desde cero para Ingenieros de Redes, Administradores de Sistemas, DevOps y Centros de Operaciones de Red (NOC).

Combina un motor de sondeo asíncrono en **Go (Fiber + Goroutines)** de alto rendimiento con una interfaz web en **React 19** que recibe telemetría instantánea vía **Server-Sent Events (SSE)**. Incluye una suite integral de herramientas de diagnóstico en tiempo real y una **Terminal Web SSH Multi-Pestaña** 100% local compatible con equipos de misión crítica (Palo Alto, Cisco, Fortinet, MikroTik, Linux).

---

### ✨ Matriz de Capacidades y Características

#### 📊 1. Observabilidad y Telemetría Central
- **⚡ Dashboard en Tiempo Real (SSE)**: La telemetría de estado y latencia se transmite en vivo mediante Server-Sent Events. Cero recargas manuales (`F5`) ni demoras de polling.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/c9f262eb-167a-4944-bef2-2272a9154f19" />
- **🚀 Motor de Alta Concurrencia en Go**: Ejecución paralela mediante goroutines con dispersión de jitter y control de avalanchas para evitar saturar enlaces WAN/LAN durante chequeos masivos.
- **🔗 Arquitectura Multienlace para Grupos**: Modela sucursales o equipos perimetrales con enlaces redundantes (ISP Principal, Respaldo, MPLS, VPN). Agregación de estado inteligente (`UP`, `DEGRADADO`, `DOWN`) con barra compuesta de peor caso.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/dc7ceceb-9f6b-4ac8-8ec3-b0b39db38965" />
- **📈 Historial en TimescaleDB**: Almacenamiento eficiente en hipertablas de series temporales. Consulta latencias, porcentajes de disponibilidad y registros de fallas en intervalos de `90m`, `3h`, `6h`, `24h` y `7d`.
  <img width="1854" height="494" alt="image" src="https://github.com/user-attachments/assets/31afa9bf-a8b1-4f26-90d4-c564c8f8ea53" />
- **🔍 Búsqueda Profunda Instantánea**: Filtra en tiempo real por Nombre de Grupo, Sensor, Descripción, Etiquetas (Tags), Puerto o Dirección IP exacta, con despliegue automático de tarjetas.
  <img width="231" height="225" alt="image" src="https://github.com/user-attachments/assets/7b526d2b-a923-4084-bd63-eb729f74c16e" />
- **🏷️ Gestión de Etiquetas (Tags)**: Clasificación visual por colores para agrupar por sede, ambiente, criticidad o proveedor.

---

#### 📶 2. Motor de Sondeo Multiprotocolo
- **ICMP Ping**: Pings directos al kernel mediante sockets crudos (`NET_RAW`) con medición precisa de milisegundos y pérdida de paquetes.
- **TCP / TCP_PING**: Comprobación del handshake de socket TCP para servicios que bloquean ICMP (firewalls, puertos de bases de datos, APIs).
- **HTTP / HTTPS**: Validación de códigos de respuesta (2xx, 3xx, 4xx, 5xx), seguimiento de redirecciones y tiempos de carga.
- **Monitoreo de Certificados SSL**: Detección anticipada de caducidad de certificados TLS, emisor y días restantes de vigencia.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/e83f4aba-cc55-4de6-be23-68e63deaa6ff" />

---

#### 🧰 3. Suite de Diagnóstico Interactivo en Vivo
Accesible en un clic desde cualquier grupo o sensor para solucionar incidencias al instante:
- **🌐 Paping (TCP Ping)**: Prueba interactiva de puertos TCP con intervalo, timeout y número de intentos configurables, salida en vivo y resumen estadístico de latencia mín/prom/máx y pérdida.
- **📡 Ping (ICMP)**: Ejecución directa de ping desde el contenedor backend para pruebas rápidas de conectividad.
- **🗺️ Traceroute**: Traza salto a salto de la ruta de red identificando IPs intermedias y latencia por nodo.
- **🔒 Analizador HTTP & SSL**: Inspección de cabeceras de respuesta y cadena de certificados en tiempo real.
- **🔎 Resolución DNS & PTR Inverso**: Consultas de registros directos (A, AAAA, CNAME, MX, TXT) y resolución inversa PTR.

---

#### 🖥️ 4. Terminal Web SSH Empresarial (SHELL SSH)
Emulador de terminal 100% local sobre **xterm.js** y túneles WebSocket seguros en Go:
- **🗂️ Soporte Multi-Pestaña**: Abre, renombra y conmuta múltiples sesiones SSH simultáneas en pestañas independientes.
- **🏢 Compatibilidad con Hardware Corporativo**: Soporte ampliado de algoritmos de intercambio de claves (KEX), cifrados y MACs para equipos modernos y legacy (Palo Alto PAN-OS, Cisco IOS/NX-OS, Fortinet, MikroTik, Linux).
- **📝 Manejo de Banners y Autenticación Interactiva**:
  - Presenta advertencias legales y avisos de consentimiento (`(yes/no)`) **directamente en el lienzo de la terminal** (experiencia idéntica a PuTTY y MobaXterm).
  - Soporta Keyboard-Interactive (RFC 4256) y Password Callback.
  - Envía la contraseña automáticamente tras aceptar el banner cuando está definida en la barra superior.
- **⌨️ Atajos de Teclado Nativos**:
  - `Ctrl + Shift + C`: Copia el texto seleccionado al portapapeles.
  - `Ctrl + Shift + V`: Pega texto en la shell (con modal fallback seguro si el navegador restringe el portapapeles).
  - `Ctrl + C`: Envía la señal nativa SIGINT (`\x03`) al proceso remoto sin desconfigurar la selección.
- **🖱️ Menú Contextual Desplegable**: Clic derecho flotante con opciones para Copiar, Pegar, Interrumpir, Limpiar Terminal y Reconectar, con cierre instantáneo al hacer clic fuera.
- **⚡ Enlace Rápido de Sensores**: Botones de acceso directo para conectar a cualquier IP/puerto del grupo en 1 clic.

---

#### 🔔 5. Sistema Inteligente de Notificaciones
- **📱 Bot de Telegram**: Alertas en HTML enriquecido con emojis de estado, duración de caída, latencias y soporte para múltiples Chat IDs.
- **📧 Correo Electrónico (SMTP / Gmail)**:
  - Asuntos dinámicos personalizables con variables (`Perdida de Telemetria: {group} - {monitor}`).
  - Remitente configurable (`From:`) con codificación RFC 2047 UTF-8.
  - Compatible con contraseñas de aplicación de Google Workspace / Gmail y servidores corporativos con STARTTLS.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/b1abb757-eec4-41f5-b6ab-1d6d35f0d8ee" />
- **🛡️ Histéresis y Anti-Flapping**: Tolerancia de reintentos configurables para evitar spam de alertas por microcortes transitorios.
- **🚨 Escalamiento a Nivel 2**: Notificación automática a contactos secundarios y canales de emergencia si la caída supera el umbral configurado (ej. 30 minutos).

---

#### 🔐 6. Control de Acceso por Roles (RBAC) y Seguridad
- **🛡️ 3 Niveles de Permisos Jerárquicos**:
  - `admin`: Control absoluto del sistema, gestión de usuarios, branding corporativo y administración de monitores.
  - `helpdesk`: Operación técnica con acceso a diagnósticos en vivo, terminal SSH, pausas y ventanas de mantenimiento.
  - `viewer`: Modo observador de solo lectura para telemetría, tableros NOC y reportes ejecutivos SLA.
- **🌊 Login con Olas Oceánicas ASCII en 3D**: Pantalla de autenticación interactiva animada mediante canvas con física de propagación de ondas (*ripples*) y estela al mover el cursor o tocar la pantalla.
- **🔒 Seguridad Robusta**: Contraseñas cifradas con `bcrypt`, validación de 6 caracteres mínimos y protección en backend contra auto-eliminación o pérdida del último administrador.
- **🖥️ Persistencia de Sesión para Salas NOC 24/7**: El token se almacena de forma indefinida en `localStorage` y Redis AOF para evitar que las pantallas de monitoreo se desautentiquen.

---

#### 🧹 7. Retención Cíclica de Historial a 90 Días
- **Limpieza Automática en TimescaleDB**: Goroutine en segundo plano que purga de forma programada cada 6 horas las métricas con más de 90 días, garantizando máxima velocidad y optimización de disco.
- **Métricas y Purga en Tiempo Real**: Panel de control en Ajustes con conteo de registros, fecha más antigua y botón de purga manual inmediata.

---

#### 💾 8. Operaciones, Respaldo e Interfaz
- **💾 Respaldo y Migración en CSV**: Exportación e importación integral de grupos, monitores y etiquetas con reporte detallado de validación y resolución de conflictos.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/90a923f4-2010-4ab3-90bf-ddf6b5683a8d" />
- **🌓 Modo Oscuro y Claro**: Paletas de alto contraste diseñadas para salas NOC y trabajo diurno prolongado.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/02b1c198-3ce9-4382-bf47-b5401e8947e9" />
- **🔒 Privacidad y 100% Local**: Sin servicios en la nube, sin telemetría externa. Todo se ejecuta estrictamente dentro de tus contenedores Docker.

---

### 🚀 Instalación Rápida con Docker

#### 1. Clonar el repositorio
```bash
git clone https://github.com/CrowPlasma/UptimeCore.git
cd UptimeCore
```

#### 2. Configurar variables de entorno
```bash
cp .env.example .env
```
Edita el archivo `.env` con tus credenciales de base de datos y puertos.

#### 3. Levantar los contenedores
```bash
docker compose up -d --build
```

#### 4. Abrir la consola
Ingresa en tu navegador web a:
```text
http://<ip-del-servidor>:5173
```
Inicia sesión con las credenciales de administrador generadas automáticamente:
- **Usuario por defecto**: `admin`
- **Contraseña por defecto**: `admin123`
*(Recuerda cambiar o actualizar estas credenciales desde **Ajustes > Seguridad & Usuarios** una vez desplegado el sistema).*

---

## 🔒 Security & Best Practices / Seguridad

- Las credenciales privadas (`.env`) y la base de datos local nunca se versionan en Git.
- Los chequeos ICMP se ejecutan de manera segura dentro del contenedor utilizando la capacidad `NET_RAW` de Linux.
- La terminal Web SSH es 100% local: las conexiones salen únicamente del contenedor hacia el host remoto en tu red privada o DMZ.
- Los correos de notificación admiten contraseñas de aplicación seguras de Google y cifrado STARTTLS.

---

## 📄 License / Licencia

Distributed under the GNU General Public License v3.0 (GPLv3). See [`LICENSE`](LICENSE) for more information.  
*Distribuido bajo la Licencia Pública General GNU v3.0 (GPLv3). Consulta [`LICENSE`](LICENSE) para más detalles.*
