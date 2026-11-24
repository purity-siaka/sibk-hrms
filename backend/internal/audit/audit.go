// Package audit writes the audit trail of sensitive actions.
package audit

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"

	"sibk-hrms/backend/internal/auth"
	"sibk-hrms/backend/internal/models"
)

// Log records an action. A failure to write is logged but never fails the request.
func Log(db *gorm.DB, a *auth.Actor, ip, action, entity string, entityID interface{}, summary string) {
	entry := models.AuditLog{
		At:       time.Now().UTC(),
		Action:   action,
		Entity:   entity,
		EntityID: fmt.Sprint(entityID),
		Summary:  truncate(summary, 1000),
		IP:       ip,
	}
	if a != nil {
		id := a.UserID
		entry.ActorID = &id
		entry.ActorName = a.Name
		entry.ActorRole = a.Role
	}
	if err := db.Create(&entry).Error; err != nil {
		log.Printf("audit write failed: %v", err)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
