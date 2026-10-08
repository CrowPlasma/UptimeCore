-- Habilitar la extensión TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Tabla de Usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Etiquetas (Tags)
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(7) DEFAULT '#000000'
);

-- Monitor Groups (Agrupación Lógica - ej. "Firewall")
CREATE TABLE monitor_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relación Grupos - Etiquetas
CREATE TABLE monitor_group_tags (
    group_id INTEGER REFERENCES monitor_groups(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, tag_id)
);

-- Monitors (Endpoints reales - ej. IP 1, IP 2)
CREATE TABLE monitors (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES monitor_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- HTTP, PING, TCP, TCP_PING
    target VARCHAR(255) NOT NULL, -- IP, Domain, or URL
    port INTEGER,
    interval_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 10,
    retries INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitor History (Datos de Series Temporales)
CREATE TABLE monitor_history (
    time TIMESTAMPTZ NOT NULL,
    monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- UP, DOWN, DEGRADED
    latency_ms INTEGER NOT NULL,
    error_msg TEXT
);

-- Convertir monitor_history en una hypertable de TimescaleDB
SELECT create_hypertable('monitor_history', 'time');

-- Crear índices para búsquedas rápidas en el dashboard
CREATE INDEX ix_monitor_history_monitor_id_time ON monitor_history (monitor_id, time DESC);

-- Configurar la política de retención (ejemplo: mantener datos en bruto por 30 días)
-- En el futuro se pueden agregar 'Continuous Aggregates' para resumir datos viejos
SELECT add_retention_policy('monitor_history', INTERVAL '30 days');
