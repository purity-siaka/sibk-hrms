// Command server runs the SIBK Management System API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"sibk-hrms/backend/internal/config"
	"sibk-hrms/backend/internal/handlers"
	"sibk-hrms/backend/internal/httpx"
	"sibk-hrms/backend/internal/models"
	"sibk-hrms/backend/internal/seed"
	"sibk-hrms/backend/internal/storage"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func openDB(url string) (*gorm.DB, error) {
	var lastErr error
	for i := 0; i < 20; i++ {
		db, err := gorm.Open(postgres.Open(url), &gorm.Config{Logger: logger.Default.LogMode(logger.Warn)})
		if err == nil {
			if sqlDB, e := db.DB(); e == nil && sqlDB.Ping() == nil {
				sqlDB.SetMaxOpenConns(20)
				sqlDB.SetMaxIdleConns(5)
				sqlDB.SetConnMaxLifetime(30 * time.Minute)
				return db, nil
			}
		}
		lastErr = err
		log.Printf("waiting for database (%d/20)...", i+1)
		time.Sleep(2 * time.Second)
	}
	if lastErr == nil {
		lastErr = errors.New("database did not become ready")
	}
	return nil, lastErr
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := openDB(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	if err := db.AutoMigrate(models.All()...); err != nil {
		return err
	}
	if err := seed.Run(db, cfg); err != nil {
		return err
	}
	var store storage.Store
	if cfg.GCSBucket != "" {
		gcs, gerr := storage.NewGCS(cfg.GCSBucket)
		if gerr != nil {
			return gerr
		}
		defer gcs.Close()
		store = gcs
		log.Printf("uploads: Google Cloud Storage bucket %s", cfg.GCSBucket)
	} else {
		disk, derr := storage.NewDisk(cfg.UploadDir)
		if derr != nil {
			return derr
		}
		store = disk
	}
	if err := seed.ApplyDataFixes(db, store); err != nil {
		return err
	}
	app := handlers.New(db, cfg, store)
	handler := httpx.Chain(app.Routes(), httpx.Recoverer, httpx.Logger, httpx.SecurityHeaders, httpx.CORS(cfg.CORSOrigin))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Printf("SIBK Management System API listening on :%s (env=%s)", cfg.Port, cfg.Env)
		errc <- srv.ListenAndServe()
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errc:
		return err
	case <-stop:
	}
	log.Println("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}
