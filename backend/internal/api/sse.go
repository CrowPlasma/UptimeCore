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
	c.Set("X-Accel-Buffering", "no")
	c.Set("Access-Control-Allow-Origin", "*")

	ch := make(chan models.CheckResult, 1000)
	
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

		// Enviar comentario de handshake inmediato para vaciar buffers de proxies (Nginx/Traefik/Dockge)
		// y asegurar que el navegador pase de readyState 0 (CONNECTING) a 1 (OPEN) al instante.
		// "retry" indica al navegador reintentar a los 3s si la conexión se corta.
		fmt.Fprintf(w, "retry: 3000\n: connected\n\n")
		fmt.Fprintf(w, "event: ping\ndata: {\"t\":%d}\n\n", time.Now().Unix())
		if err := w.Flush(); err != nil {
			return
		}

		// Heartbeat como evento con nombre ("ping"): los comentarios SSE no son visibles desde JS,
		// por lo que el watchdog del frontend necesita un evento real para saber que el stream sigue vivo.
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case res, ok := <-ch:
				if !ok {
					return
				}
				data, err := json.Marshal(res)
				if err == nil {
					fmt.Fprintf(w, "data: %s\n\n", data)
					if err := w.Flush(); err != nil {
						return // Navegador desconectado
					}
				}
			case <-ticker.C:
				// Ping para mantener la conexión viva (Keep-Alive) y alimentar el watchdog del navegador
				fmt.Fprintf(w, "event: ping\ndata: {\"t\":%d}\n\n", time.Now().Unix())
				if err := w.Flush(); err != nil {
					return
				}
			}
		}
	})
	return nil
}
