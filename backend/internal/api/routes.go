package api

import (
	"encoding/json"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"ping-eye/internal/database"
	"ping-eye/internal/models"
)

// AuthGuard returns middleware enforcing minimum role: "viewer", "helpdesk", or "admin".
func AuthGuard(cache *database.Cache, db *database.DB, minRole string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := extractToken(c)
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Authentication required"})
		}

		sessionData, err := cache.GetSession(c.Context(), token)
		var user models.User
		if err == nil && sessionData != "" {
			_ = json.Unmarshal([]byte(sessionData), &user)
		}

		// Fallback: If Redis was flushed, query DB directly if token matches or user exists
		if user.ID == 0 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session expired or invalid"})
		}

		roleRank := map[string]int{
			"viewer":   1,
			"helpdesk": 2,
			"admin":    3,
		}

		userRank := roleRank[strings.ToLower(user.Role)]
		requiredRank := roleRank[strings.ToLower(minRole)]

		if userRank < requiredRank {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Forbidden: insufficient permissions for role " + user.Role,
			})
		}

		c.Locals("user", user)
		return c.Next()
	}
}

// SSHAuthGuard protects WebSSH WebSocket connections.
func SSHAuthGuard(cache *database.Cache) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := extractToken(c)
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).SendString("Authentication required")
		}
		sessionData, err := cache.GetSession(c.Context(), token)
		if err != nil || sessionData == "" {
			return c.Status(fiber.StatusUnauthorized).SendString("Invalid session")
		}
		var user models.User
		_ = json.Unmarshal([]byte(sessionData), &user)
		if user.Role != "admin" && user.Role != "helpdesk" {
			return c.Status(fiber.StatusForbidden).SendString("Viewer role cannot access WebSSH terminal")
		}
		c.Locals("user", user)
		return c.Next()
	}
}

// SetupRoutes registers all API routes and middleware.
func SetupRoutes(app *fiber.App, h *Handlers, hub *SSEHub) {
	// Allow frontend dev server (port 5173) and any origin in dev.
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Content-Type,Authorization,X-Auth-Token",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "up", "service": "ping-eye"})
	})

	api := app.Group("/api")

	// Public Auth routes
	api.Post("/auth/login", h.Login)

	// Server-Sent Events (Real-Time Push)
	api.Get("/stream", hub.Handler)

	// Push Agent metrics (authenticated by monitor token)
	api.Post("/push/:token", h.PushAgent)

	// --- Viewer or higher (Read-Only) ---
	viewerGuard := AuthGuard(h.cache, h.db, "viewer")
	api.Get("/auth/me", viewerGuard, h.Me)
	api.Post("/auth/logout", h.Logout)

	api.Get("/tags", viewerGuard, h.ListTags)
	api.Get("/export", viewerGuard, h.ExportCSV)
	api.Get("/groups", viewerGuard, h.ListGroups)
	api.Get("/monitors/:id/history", viewerGuard, h.GetHistory)
	api.Get("/incidents", viewerGuard, h.ListIncidents)
	api.Get("/reports/sla", viewerGuard, h.GetSlaReport)
	api.Get("/settings", viewerGuard, h.GetSettings)

	// --- Helpdesk or Admin (Operational actions: toggle, maintenance, diagnostics, shell) ---
	helpdeskGuard := AuthGuard(h.cache, h.db, "helpdesk")
	api.Put("/groups/:id/toggle", helpdeskGuard, h.ToggleGroup)
	api.Put("/groups/:id/maintenance", helpdeskGuard, h.ToggleGroupMaintenance)
	api.Put("/monitors/:id/toggle", helpdeskGuard, h.ToggleMonitor)
	api.Put("/monitors/:id/maintenance", helpdeskGuard, h.ToggleMaintenance)
	api.Post("/monitors/test", helpdeskGuard, h.TestMonitor)
	api.Post("/diagnostics/run", helpdeskGuard, h.RunDiagnostic)
	api.Get("/ssh/ws", SSHAuthGuard(h.cache), SSHUpgradeGuard, SSHTerminalHandler())

	// --- Admin Only (Full control: create, edit, delete, users, retention, wipe) ---
	adminGuard := AuthGuard(h.cache, h.db, "admin")
	api.Post("/groups", adminGuard, h.CreateGroup)
	api.Put("/groups/:id", adminGuard, h.UpdateGroup)
	api.Delete("/groups/:id", adminGuard, h.DeleteGroup)

	api.Post("/monitors", adminGuard, h.CreateMonitor)
	api.Put("/monitors/:id", adminGuard, h.UpdateMonitor)
	api.Delete("/monitors/:id", adminGuard, h.DeleteMonitor)

	api.Post("/tags", adminGuard, h.CreateTag)
	api.Put("/tags/:id", adminGuard, h.UpdateTag)
	api.Delete("/tags/:id", adminGuard, h.DeleteTag)

	api.Post("/import", adminGuard, h.ImportCSV)
	api.Put("/settings", adminGuard, h.UpdateSettings)
	api.Delete("/system/wipe", adminGuard, h.WipeAllData)

	// User Management (Admin only)
	api.Get("/users", adminGuard, h.ListUsers)
	api.Post("/users", adminGuard, h.CreateUser)
	api.Put("/users/:id", adminGuard, h.UpdateUser)
	api.Put("/users/:id/password", adminGuard, h.ResetUserPassword)
	api.Delete("/users/:id", adminGuard, h.DeleteUser)

	// History Retention (Admin only)
	api.Get("/system/retention", adminGuard, h.GetRetentionStats)
	api.Post("/system/retention/purge", adminGuard, h.PurgeRetentionHistory)
}
