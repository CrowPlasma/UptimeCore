package api

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// SetupRoutes registers all API routes and middleware.
func SetupRoutes(app *fiber.App, h *Handlers, hub *SSEHub) {
	// Allow frontend dev server (port 5173) and any origin in dev.
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Content-Type,Authorization",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "up", "service": "ping-eye"})
	})

	api := app.Group("/api")

	// Server-Sent Events (Real-Time Push)
	api.Get("/stream", hub.Handler)

	
	// Tags
	api.Get("/tags", h.ListTags)
	api.Post("/tags", h.CreateTag)
	api.Put("/tags/:id", h.UpdateTag)
	api.Delete("/tags/:id", h.DeleteTag)

	
	// Export / Import
	api.Get("/export", h.ExportCSV)
	api.Post("/import", h.ImportCSV)

	// Monitor Groups
	api.Get("/groups", h.ListGroups)
	api.Post("/groups", h.CreateGroup)
	api.Put("/groups/:id", h.UpdateGroup)
	api.Delete("/groups/:id", h.DeleteGroup)

		// Push Agent metrics
	api.Post("/push/:token", h.PushAgent)

	// Monitor Endpoints
	api.Post("/monitors", h.CreateMonitor)
	api.Put("/monitors/:id", h.UpdateMonitor)
	api.Put("/monitors/:id/toggle", h.ToggleMonitor)
	api.Put("/monitors/:id/maintenance", h.ToggleMaintenance)
	api.Delete("/monitors/:id", h.DeleteMonitor)
	api.Get("/monitors/:id/history", h.GetHistory)
	api.Delete("/system/wipe", h.WipeAllData)

	// Settings
	api.Get("/settings", h.GetSettings)
	api.Put("/settings", h.UpdateSettings)
}
