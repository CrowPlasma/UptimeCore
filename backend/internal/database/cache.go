package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// statusTTL is how long the latest status of a monitor survives in Redis.
// It must comfortably exceed the largest polling interval, otherwise a monitor
// would flip back to UNKNOWN between checks.
const statusTTL = 24 * time.Hour

// Cache wraps the Redis client for storing live monitor status.
type Cache struct {
	client *redis.Client
}

// ConnectRedis creates a Redis client and verifies connectivity.
func ConnectRedis(addr string) *Cache {
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	for i := 0; i < 5; i++ {
		if err := rdb.Ping(context.Background()).Err(); err == nil {
			log.Println("✅ Connected to Redis")
			return &Cache{client: rdb}
		}
		log.Printf("⏳ Waiting for Redis... attempt %d/5", i+1)
		time.Sleep(2 * time.Second)
	}
	log.Println("⚠️  Redis unavailable, continuing without cache")
	return &Cache{client: rdb}
}

// SetStatus caches the latest status and latency for a monitor.
func (c *Cache) SetStatus(ctx context.Context, monitorID int, status string, latencyMs int, msg string, metricValue *float64) {
	c.client.Set(ctx, fmt.Sprintf("m:%d:status", monitorID), status, statusTTL)
	c.client.Set(ctx, fmt.Sprintf("m:%d:latency", monitorID), fmt.Sprintf("%d", latencyMs), statusTTL)
	c.client.Set(ctx, fmt.Sprintf("m:%d:msg", monitorID), msg, statusTTL)
	if metricValue != nil {
		c.client.Set(ctx, fmt.Sprintf("m:%d:metricval", monitorID), fmt.Sprintf("%f", *metricValue), statusTTL)
	} else {
		c.client.Del(ctx, fmt.Sprintf("m:%d:metricval", monitorID))
	}
}

// GetStatus retrieves the latest cached status and latency for a monitor.
func (c *Cache) GetStatus(ctx context.Context, monitorID int) (status string, latencyMs int, msg string, metricValue *float64) {
	s, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:status", monitorID)).Result()
	l, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:latency", monitorID)).Result()
	msg, _ = c.client.Get(ctx, fmt.Sprintf("m:%d:msg", monitorID)).Result()
	v, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:metricval", monitorID)).Result()

	if s == "" {
		s = "UNKNOWN"
	}
	latencyMs = 0
	fmt.Sscanf(l, "%d", &latencyMs)

	var mVal *float64
	if v != "" {
		var val float64
		if _, err := fmt.Sscanf(v, "%f", &val); err == nil {
			mVal = &val
		}
	}

	return s, latencyMs, msg, mVal
}

// IncFails increments the consecutive failure counter and returns the new value.
func (c *Cache) IncFails(ctx context.Context, monitorID int) int {
	res, _ := c.client.Incr(ctx, fmt.Sprintf("m:%d:fails", monitorID)).Result()
	c.client.Expire(ctx, fmt.Sprintf("m:%d:fails", monitorID), 24*time.Hour)
	return int(res)
}

// ResetFails resets the consecutive failure counter to 0.
func (c *Cache) ResetFails(ctx context.Context, monitorID int) {
	c.client.Del(ctx, fmt.Sprintf("m:%d:fails", monitorID))
}

// IsAlerted checks if a DOWN alert has already been sent to prevent spam.
func (c *Cache) IsAlerted(ctx context.Context, monitorID int) bool {
	res, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:alerted", monitorID)).Result()
	return res == "true"
}

// SetAlerted marks the monitor as alerted (or resets it when recovered).
func (c *Cache) SetAlerted(ctx context.Context, monitorID int, alerted bool) {
	if alerted {
		c.client.Set(ctx, fmt.Sprintf("m:%d:alerted", monitorID), "true", 7*24*time.Hour)
	} else {
		c.client.Del(ctx, fmt.Sprintf("m:%d:alerted", monitorID))
	}
}

// Escalation support
func (c *Cache) SetDownSince(ctx context.Context, monitorID int, ts int64) {
	c.client.Set(ctx, fmt.Sprintf("m:%d:down_since", monitorID), ts, 0)
}

func (c *Cache) GetDownSince(ctx context.Context, monitorID int) int64 {
	val, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:down_since", monitorID)).Int64()
	return val
}

func (c *Cache) ClearDownSince(ctx context.Context, monitorID int) {
	c.client.Del(ctx, fmt.Sprintf("m:%d:down_since", monitorID))
}

func (c *Cache) IsEscalated(ctx context.Context, monitorID int) bool {
	val, _ := c.client.Get(ctx, fmt.Sprintf("m:%d:escalated", monitorID)).Result()
	return val == "true"
}

func (c *Cache) SetEscalated(ctx context.Context, monitorID int, escalated bool) {
	if escalated {
		c.client.Set(ctx, fmt.Sprintf("m:%d:escalated", monitorID), "true", 0)
	} else {
		c.client.Del(ctx, fmt.Sprintf("m:%d:escalated", monitorID))
	}
}
