package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"ping-eye/internal/models"
)

// SSEHub maneja todas las conexiones activas en tiempo real.
type SSEHub struct {
	clients map[chan models.CheckResult]bool
	mu      sync.Mutex
}

func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients: make(map[chan models.CheckResult]bool),
	}
}

// Broadcast envía el resultado de un chequeo a todos los navegadores conectados.
func (h *SSEHub) Broadcast(r models.CheckResult) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- r:
		default:
			// Si el cliente es lento y su buffer se llena, ignoramos para no bloquear el Engine
		}
	}
}

// Handler es la ruta de Fiber para GET /api/stream
func (h *SSEHub) Handler(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Access-Control-Allow-Origin", "*")

	ch := make(chan models.CheckResult, 50)
	
	h.mu.Lock()
	h.clients[ch] = true
	h.mu.Unlock()

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// Limpiar conexión al salir
		defer func() {
			h.mu.Lock()
			delete(h.clients, ch)
			h.mu.Unlock()
		}()

		for {
			select {
			case res := <-ch:
				data, _ := json.Marshal(res)
				fmt.Fprintf(w, "data: %s\n\n", data)
				if err := w.Flush(); err != nil {
					return // Navegador desconectado
				}
			case <-time.After(15 * time.Second):
				// Ping para mantener la conexión viva (Keep-Alive)
				fmt.Fprintf(w, ": keepalive\n\n")
				if err := w.Flush(); err != nil {
					return
				}
			}
		}
	})
	return nil
}
