// main is the entry point for the UptimeCore API server.
// It wires together the database, cache, polling engine, and HTTP API.
package main

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"ping-eye/internal/api"
	"ping-eye/internal/config"
	"ping-eye/internal/database"
	"ping-eye/internal/monitor"
)

func main() {
	cfg := config.Load()

	// Connect to PostgreSQL / TimescaleDB
	db := database.ConnectPostgres(cfg.DBUrl)
	defer db.Close()

	// Auto-migrate tables
	db.AutoMigrate(context.Background())

	// Connect to Redis cache
	cache := database.ConnectRedis(cfg.RedisUrl)

	// Create Server-Sent Events Hub
	hub := api.NewSSEHub()

	// Start the asynchronous polling engine
	engine := monitor.NewEngine(db, cache, cfg, hub)
	engine.Start(context.Background())

	// Set up Fiber HTTP server
	// ReadBufferSize/WriteBufferSize raised to 64 KB (default is 4 KB in fasthttp)
	// to prevent HTTP 431 "Request Header Fields Too Large" when browsers send
	// large domain/corporate SSO cookies alongside standard headers.
	app := fiber.New(fiber.Config{
		AppName:         "UptimeCore Monitor",
		ReadBufferSize:  64 * 1024,
		WriteBufferSize: 64 * 1024,
		BodyLimit:       50 * 1024 * 1024,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${method} ${path} → ${status} (${latency})\n",
	}))

	// Register all routes
	handlers := api.NewHandlers(db, cache, engine)
	api.SetupRoutes(app, handlers, hub)

	log.Printf("🚀 UptimeCore API running on :%s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
