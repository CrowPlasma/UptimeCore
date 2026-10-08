package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBUrl    string
	RedisUrl string
	Port     string

	// Notificaciones
	TeamsWebhook string
	GChatWebhook string
	SmtpHost     string
	SmtpPort     string
	SmtpUser     string
	SmtpPass     string
	SmtpFrom     string
	SmtpTo       string
}

func Load() Config {
	_ = godotenv.Load()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return Config{
		DBUrl:        os.Getenv("DB_URL"),
		RedisUrl:     os.Getenv("REDIS_URL"),
		Port:         port,
		TeamsWebhook: os.Getenv("TEAMS_WEBHOOK_URL"),
		GChatWebhook: os.Getenv("GCHAT_WEBHOOK_URL"),
		SmtpHost:     os.Getenv("SMTP_HOST"),
		SmtpPort:     os.Getenv("SMTP_PORT"),
		SmtpUser:     os.Getenv("SMTP_USER"),
		SmtpPass:     os.Getenv("SMTP_PASS"),
		SmtpFrom:     os.Getenv("SMTP_FROM"),
		SmtpTo:       os.Getenv("SMTP_TO"),
	}
}
