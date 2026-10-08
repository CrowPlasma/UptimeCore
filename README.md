# 🚀 UptimeCore

UptimeCore is an enterprise-grade network monitoring and observability platform. Designed for high concurrency and real-time visualization, it allows IT and DevOps teams to track the health of hundreds of endpoints with sub-second accuracy.

![UptimeCore Dashboard](https://img.shields.io/badge/Status-Active-success)
![Go](https://img.shields.io/badge/Backend-Go_Fiber-00ADD8?logo=go)
![React](https://img.shields.io/badge/Frontend-React_Zustand-61DAFB?logo=react)
![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-FDB515?logo=postgresql)

## ✨ Features

- **Real-Time Observability**: UI updates instantly via Server-Sent Events (SSE). No manual refreshing required.
- **High-Concurrency Engine**: Go-based polling engine capable of monitoring hundreds of endpoints simultaneously without degrading network performance (features Jitter & Thundering Herd protection).
- **Multi-Protocol Support**: `PING`, `TCP_PING`, `HTTP/S`, and `SNMP` hardware metrics.
- **Smart Alerting**: Intelligent alerting system (Telegram, Email) with degradation tracking and hysteresis (prevents alert storms).
- **Time-Series History**: Powered by TimescaleDB to efficiently store and query historical latency and uptime data.
- **Anti-Avalanche UI**: Groups and consolidates visual toast notifications during massive network outages to keep the dashboard clean.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite, Zustand (State Management), Lucide Icons.
- **Backend**: Go, Fiber (HTTP Framework), pgx (Postgres driver), go-redis.
- **Databases**: 
  - **PostgreSQL / TimescaleDB**: Persistent configuration and time-series telemetry.
  - **Redis**: High-speed caching and live state broadcasting.
- **Infrastructure**: Docker & Docker Compose (Ready for Dockge/Portainer).

## 🚀 Quick Start (Production via Dockge)

UptimeCore is containerized and ready to be deployed using Dockge or any standard Docker Compose environment.

1. Clone the repository:
   ```bash
   git clone https://github.com/CrowPlasma/UptimeCore.git
   cd UptimeCore
   ```

2. Create a `.env` file in the root directory (use `.env.example` as a template).

3. Deploy using Docker Compose:
   ```bash
   docker compose up -d
   ```

4. Access the dashboard at `http://<your-server-ip>:5173` (or via your reverse proxy).

## 🔒 Security & Data

By default, UptimeCore does not track or expose your internal topologies. Ensure your `.env` file containing database passwords and Telegram bot tokens is never committed to version control.
