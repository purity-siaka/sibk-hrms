// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

const defaultSecret = "change-me-in-production-change-me-in-production"

// Config holds every setting the server needs.
type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	UploadDir     string
	GCSBucket     string
	CORSOrigin    string
	Env           string
	AdminEmail    string
	AdminPassword string
	SeedDemo      bool
	SMTPHost      string
	SMTPPort      string
	SMTPUser      string
	SMTPPass      string
	SMTPAuth      string
	MailFrom      string
	MailFromName  string
	HRMailbox     string
}

func get(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Load reads the environment and validates it.
func Load() (Config, error) {
	seed, _ := strconv.ParseBool(get("SEED_DEMO", "false"))
	c := Config{
		Port:          get("PORT", "8080"),
		DatabaseURL:   get("DATABASE_URL", "postgres://hrms:hrms@localhost:5432/hrms?sslmode=disable"),
		JWTSecret:     get("JWT_SECRET", defaultSecret),
		UploadDir:     get("UPLOAD_DIR", "./uploads"),
		GCSBucket:     get("GCS_BUCKET", ""),
		CORSOrigin:    get("CORS_ORIGIN", "http://localhost:3000"),
		Env:           get("APP_ENV", "production"),
		AdminEmail:    strings.ToLower(get("ADMIN_EMAIL", "")),
		AdminPassword: get("ADMIN_PASSWORD", ""),
		SeedDemo:      seed,
		SMTPHost:      get("SMTP_HOST", ""),
		SMTPPort:      get("SMTP_PORT", "587"),
		SMTPUser:      get("SMTP_USER", ""),
		SMTPPass:      os.Getenv("SMTP_PASS"),
		SMTPAuth:      get("SMTP_AUTH", "plain"),
		MailFrom:      get("MAIL_FROM", get("SMTP_USER", "")),
		MailFromName:  get("MAIL_FROM_NAME", "IT Department"),
		HRMailbox:     get("HR_MAILBOX", "hr@salaaminvestments.com"),
	}
	if c.Env != "development" {
		if c.JWTSecret == defaultSecret || len(c.JWTSecret) < 32 {
			return c, errors.New("JWT_SECRET must be set to at least 32 characters (or set APP_ENV=development)")
		}
	}
	return c, nil
}

// IsDev reports whether the server runs in development mode.
func (c Config) IsDev() bool { return c.Env == "development" }
