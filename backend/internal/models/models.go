// Package models defines all shared data structures for UptimeCore.
package models

import "time"

// MonitorStatus represents the operational state of a monitor.
type MonitorStatus string

const (
	StatusUP         MonitorStatus = "UP"
	StatusDOWN       MonitorStatus = "DOWN"
	StatusDEGRADED   MonitorStatus = "DEGRADED"
	StatusUNKNOWN    MonitorStatus = "UNKNOWN"
	StatusPAUSED     MonitorStatus = "PAUSED"
	StatusMAINTENANCE MonitorStatus = "MAINTENANCE"
)

// Tag is a label used to classify monitors.
type Tag struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// MonitorGroup is a logical grouping of one or more Monitor endpoints.
// Example: a firewall with multiple ISP links.
type MonitorGroup struct {
	ID            int           `json:"id"`
	Name          string        `json:"name"`
	Description   *string       `json:"description"`
	CreatedAt     time.Time     `json:"created_at"`
	Tags          []Tag         `json:"tags"`
	Monitors      []Monitor     `json:"monitors"`
	OverallStatus MonitorStatus `json:"overall_status"`
}

// Monitor is a single endpoint being actively monitored.
type Monitor struct {
	ID              int           `json:"id"`
	GroupID         *int          `json:"group_id"`
	Name            string        `json:"name"`
	Type            string        `json:"type"` // HTTP, HTTPS, PING, TCP, TCP_PING
	Target          string        `json:"target"`
	Port            *int          `json:"port"`
	IntervalSeconds int           `json:"interval_seconds"`
	TimeoutSeconds  int           `json:"timeout_seconds"`
	Retries         int           `json:"retries"`
	SnmpCommunity   *string       `json:"snmp_community"`
	SslExpirationDays *int        `json:"ssl_expiration_days"`
	SnmpOID         *string       `json:"snmp_oid"`
	IsActive        bool          `json:"is_active"`
	IsMaintenance   bool          `json:"is_maintenance"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`

	PushToken       *string       `json:"push_token"`
	CpuThreshold    *int          `json:"cpu_threshold"`
	RamThreshold    *int          `json:"ram_threshold"`
	DiskThreshold   *int          `json:"disk_threshold"`
	ValueThreshold  *int          `json:"value_threshold"`
	// Live fields populated from Redis cache
	CurrentStatus  MonitorStatus `json:"current_status"`
	CurrentLatency int           `json:"current_latency_ms"`
	CurrentMsg     string        `json:"current_msg"`
	CurrentCpu     *float64      `json:"current_cpu"`
	CurrentRam     *float64      `json:"current_ram"`
	CurrentDisk    *float64      `json:"current_disk"`
	CurrentValue   *float64      `json:"current_value"`
	RecentHistory  []HistoryPoint `json:"live_history,omitempty"`
}

// HistoryPoint is a single data point in a monitor's time-series history.
type HistoryPoint struct {
	Time       time.Time     `json:"time"`
	Status     MonitorStatus `json:"status"`
	LatencyMs  int           `json:"latency_ms"`
	ErrorMsg   string        `json:"error_msg,omitempty"`
	MetricCpu  *float64      `json:"metric_cpu,omitempty"`
	MetricRam  *float64      `json:"metric_ram,omitempty"`
	MetricDisk *float64      `json:"metric_disk,omitempty"`
	MetricValue *float64     `json:"metric_value,omitempty"`
}

// CheckResult is the output of a single check execution.
type CheckResult struct {
	MonitorID  int
	Status     MonitorStatus
	LatencyMs  int
	ErrorMsg   string
	CheckedAt  time.Time
	MetricCpu  *float64
	MetricRam  *float64
	MetricDisk *float64
	MetricValue *float64
}
