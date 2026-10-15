# 🚀 UptimeCore

<div align="center">

**Enterprise Network Monitoring & Real-Time Observability Platform**  
*Plataforma Empresarial de Monitoreo de Redes y Observabilidad en Tiempo Real*

[English](#-english) • [Español](#-español)

[![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)](https://github.com/CrowPlasma/UptimeCore)
[![Go](https://img.shields.io/badge/Backend-Go_Fiber-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-FDB515?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![Redis](https://img.shields.io/badge/Cache-Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Deployment-Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

<a name="-english"></a>
## 🌐 English

### Overview
**UptimeCore** is a modern, high-concurrency network monitoring and telemetry platform built from the ground up to solve the challenges of multi-link infrastructure, distributed branches, and mission-critical endpoints. 

Designed for Network Engineers, DevOps, and IT Operations teams, UptimeCore combines sub-second asynchronous probing in Go with an intuitive, ultra-fast real-time React dashboard powered by Server-Sent Events (SSE).

### ✨ Key Features

- **⚡ Real-Time SSE Dashboard**: Instant live telemetry streamed via Server-Sent Events. Zero manual refreshing or page polling.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/7a793349-41fd-4488-912e-e5c25d74bdfd" />

- **🚀 High-Concurrency Engine in Go**: Powered by Go goroutines and non-blocking I/O. Capable of checking hundreds of endpoints concurrently with jitter dispersion and anti-thundering-herd protection.
- **🔗 Smart Group & Multi-Link Architecture**: Model multi-homed routers, redundant firewalls, or branches with multiple ISP/VPN links. UptimeCore aggregates status and displays worst-case timeline bars so you can detect partial outages and degradations at a glance.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/af1c74f2-1122-4852-84b9-b84bb4806de6" />

- **🔍 Full Search (Name, Tags & IP Addresses)**: Instantly filter groups and endpoints by client name, description, tags, port, or exact IP address, with auto-expanding cards.
  <img width="231" height="225" alt="image" src="https://github.com/user-attachments/assets/8aceaf68-294f-4104-bd80-18b6213ce2c4" />

- **📶 Multi-Protocol Probing**:
  - `ICMP Ping`: High-performance kernel-level raw socket pings.
  - `TCP / TCP_PING`: Port availability and handshake latency.
  - `HTTP / HTTPS`: Status code validation, redirect tracking, and response timing.
  - `SSL Certificate Monitoring`: Proactive expiration warnings.
    <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/dea91b0a-4353-4462-a5f8-362a0707456f" />

- **🔔 Intelligent Notification Dispatcher**:
  - **Telegram Bot**: Rich HTML alerts with emoji status indicators and multiple chat IDs.
  - **Customizable SMTP / Email**: Tuneable sender display name (`From:`) and dynamic subject headers (`Perdida de Telemetria: {group} - {monitor}`) with RFC 2047 UTF-8 support.
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/bea4140e-d468-41f5-8358-15d0f062e481" />

- **🛡️ Hysteresis & Anti-Flapping Protection**: Configurable retries and latency degradation thresholds eliminate notification spam during momentary spikes.
- **🚨 Level 2 Multi-Tier Escalation**: If an outage exceeds a customizable grace period (e.g., 30 minutes), secondary alert channels and emergency contacts are notified automatically.
- **📊 TimescaleDB Time-Series Storage**: Hypertable-backed history retention with ultra-fast latency querying over 90m, 3h, 6h, 24h, and 7d intervals.
  <img width="1854" height="494" alt="image" src="https://github.com/user-attachments/assets/6556c237-b525-4030-80fa-3bb3e1a99698" />

- **💾 CSV Backup & Migration**: Complete one-click export and import of all groups, endpoints, and tags with built-in validation.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/e8ef57c9-fdd3-4c16-9f3c-fc807155e6b5" />

- **🌓 Dark & Light Mode**: Ergonomic, high-contrast UI tailored for NOC monitors and daylight operations.
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/d541c738-2938-4ca2-8fce-2f15367b90f8" />

---

### 🛠️ Architecture & Tech Stack

```text
┌─────────────────┐       SSE (Live Stream)       ┌────────────────────────┐
│  React 18 SPA   │ ◄───────────────────────────  │    Go Fiber Engine     │
│  Zustand + Vite │ ────────── REST API ────────► │ (Goroutine Schedulers) │
└─────────────────┘                               └───────────┬────────────┘
                                                              │
                                      ┌───────────────────────┴───────────────────────┐
                                      ▼                                               ▼
                         ┌─────────────────────────┐                     ┌─────────────────────────┐
                         │   TimescaleDB (pgx)     │                     │     Redis Cache         │
                         │ (Hypertable Time-Series)│                     │ (Sub-ms Live State)     │
                         └─────────────────────────┘                     └─────────────────────────┘
```

- **Frontend**: React 18, TypeScript, Vite, Zustand, Lucide Icons.
- **Backend**: Go (Golang), Fiber v2, pgx v5, go-redis.
- **Storage**: TimescaleDB (PostgreSQL 16) + Redis 7.
- **Deployment**: Docker Compose, Dockge, Portainer.

---

### 🚀 Quick Start Deployment

UptimeCore is fully containerized and deploys in seconds.

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

---

<a name="-español"></a>
## 🇪🇸 Español

### Descripción General
**UptimeCore** es una plataforma moderna de observabilidad y monitoreo de redes diseñada desde cero para resolver los retos de infraestructuras multi-enlace, sucursales distribuidas y servicios de misión crítica.

Creado para ingenieros de redes, administradores de sistemas y equipos DevOps, UptimeCore combina chequeos asíncronos ultrarrápidos en Go con un panel de control interactivo en React potenciado por Server-Sent Events (SSE).

### ✨ Características Principales

- **⚡ Dashboard en Tiempo Real (SSE)**: La telemetría se actualiza al instante vía Server-Sent Events sin necesidad de recargar la página (`F5`).
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/c9f262eb-167a-4944-bef2-2272a9154f19" />

- **🚀 Motor de Alta Concurrencia en Go**: Ejecución en paralelo mediante goroutines de Go con dispersión de jitter y protección contra avalanchas (evita sobrecargar los enlaces de red).
- **🔗 Arquitectura Multienlace para Grupos**: Modela sucursales o firewalls que tienen múltiples enlaces (ISP 1, ISP 2, MPLS, VPN). Si uno cae, el grupo pasa automáticamente a **Degradado** y la barra de historial combina el estado de todos los enlaces activos.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/dc7ceceb-9f6b-4ac8-8ec3-b0b39db38965" />

- **🔍 Búsqueda Avanzada (Nombre, Etiquetas e IP)**: Localiza inmediatamente cualquier grupo o endpoint por nombre, descripción, tag, o dirección IP con apertura automática de acordeones.
  <img width="231" height="225" alt="image" src="https://github.com/user-attachments/assets/7b526d2b-a923-4084-bd63-eb729f74c16e" />

- **📶 Monitoreo Multiprotocolo**:
  - `ICMP Ping`: Pings de bajo nivel mediante sockets raw (NET_RAW).
  - `TCP / TCP_PING`: Verificación de puertos y tiempo de respuesta de socket.
  - `HTTP / HTTPS`: Validación de códigos de estado, redirecciones y tiempos de carga.
  - `Monitoreo SSL`: Detección temprana del vencimiento de certificados.
    <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/e83f4aba-cc55-4de6-be23-68e63deaa6ff" />

- **🔔 Despachador de Alertas Inteligente**:
  - **Bot de Telegram**: Mensajes enriquecidos en HTML con emojis de estado y soporte para múltiples Chat IDs.
  - **Correo Electrónico (SMTP/Gmail)**: Encabezados y nombres de remitente (`From:`) totalmente personalizables con variables dinámicas (`{group}`, `{monitor}`, `{target}`, `{status}`) y codificación RFC 2047 UTF-8.
    <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/b1abb757-eec4-41f5-b6ab-1d6d35f0d8ee" />

- **🛡️ Histéresis y Protección Anti-Flapping**: Tolerancia configurable para evitar tormentas de alertas por microcortes o latencias temporales.
- **🚨 Alertas Escalonadas de Nivel 2**: Si una caída supera el tiempo de tolerancia configurado (ej. 30 minutos), se disparan alertas a contactos de emergencia secundarios.
- **📊 Historial de Telemetría en TimescaleDB**: Almacenamiento eficiente en hipertablas para consultar latencias y estados en rangos de 90m, 3h, 6h, 24h y 7d.
  <img width="1854" height="494" alt="image" src="https://github.com/user-attachments/assets/31afa9bf-a8b1-4f26-90d4-c564c8f8ea53" />

- **💾 Respaldo y Migración en CSV**: Exportación e importación integral de grupos, monitores y etiquetas en formato CSV con reporte detallado de validación.
  <img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/90a923f4-2010-4ab3-90bf-ddf6b5683a8d" />

- **🌓 Modo Oscuro y Claro**: Paleta de alto contraste optimizada para pantallas NOC y trabajo continuo.
<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/02b1c198-3ce9-4382-bf47-b5401e8947e9" />

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

---

## 🔒 Security & Best Practices / Seguridad

- Las credenciales privadas (`.env`) y la base de datos local nunca se versionan en Git.
- Los chequeos ICMP se ejecutan de manera segura dentro del contenedor utilizando la capacidad `NET_RAW` de Linux.
- Los correos de notificación admiten contraseñas de aplicación seguras de Google y cifrado STARTTLS.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
