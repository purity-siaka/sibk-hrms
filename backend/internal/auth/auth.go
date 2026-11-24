// Package auth implements passwords, HS256 JWTs, login rate limiting and the request actor.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"sibk-hrms/backend/internal/models"
)

// Actor is the authenticated caller.
type Actor struct {
	UserID     uint
	Name       string
	Email      string
	Role       string
	EmployeeID *uint
}

// IsHR reports whether the actor is HR staff (admin or officer).
func (a *Actor) IsHR() bool {
	return a.Role == models.RoleHRAdmin || a.Role == models.RoleHROfficer
}

// IsAdmin reports whether the actor is an HR admin.
func (a *Actor) IsAdmin() bool { return a.Role == models.RoleHRAdmin }

// HasRole reports whether the actor has any of the roles.
func (a *Actor) HasRole(roles ...string) bool {
	for _, r := range roles {
		if a.Role == r {
			return true
		}
	}
	return false
}

// IsEmployee reports whether empID is the actor's own employee record.
func (a *Actor) IsEmployee(empID uint) bool {
	return a.EmployeeID != nil && *a.EmployeeID == empID
}

// ---- JWT (HS256) ----

type claims struct {
	Sub uint  `json:"sub"`
	Iat int64 `json:"iat"`
	Exp int64 `json:"exp"`
}

var b64 = base64.RawURLEncoding

const jwtHeader = `{"alg":"HS256","typ":"JWT"}`

func mac(secret, data string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(data))
	return h.Sum(nil)
}

// Sign returns a signed token for the user that expires after ttl.
func Sign(secret string, userID uint, ttl time.Duration) (string, error) {
	now := time.Now()
	body, err := json.Marshal(claims{Sub: userID, Iat: now.Unix(), Exp: now.Add(ttl).Unix()})
	if err != nil {
		return "", err
	}
	unsigned := b64.EncodeToString([]byte(jwtHeader)) + "." + b64.EncodeToString(body)
	return unsigned + "." + b64.EncodeToString(mac(secret, unsigned)), nil
}

// ErrInvalidToken is returned for any malformed, forged or expired token.
var ErrInvalidToken = errors.New("invalid token")

// Verify checks signature and expiry and returns the user id.
func Verify(secret, token string) (uint, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, ErrInvalidToken
	}
	hdr, err := b64.DecodeString(parts[0])
	if err != nil || string(hdr) != jwtHeader {
		return 0, ErrInvalidToken
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		return 0, ErrInvalidToken
	}
	if !hmac.Equal(sig, mac(secret, parts[0]+"."+parts[1])) {
		return 0, ErrInvalidToken
	}
	raw, err := b64.DecodeString(parts[1])
	if err != nil {
		return 0, ErrInvalidToken
	}
	var c claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return 0, ErrInvalidToken
	}
	if c.Sub == 0 || time.Now().Unix() >= c.Exp {
		return 0, ErrInvalidToken
	}
	return c.Sub, nil
}

// ---- passwords ----

const bcryptCost = 12

var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password-1"), bcryptCost)

// HashPassword hashes a password with bcrypt.
func HashPassword(p string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(p), bcryptCost)
	return string(h), err
}

// CheckPassword compares a password to a bcrypt hash.
func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}

// BurnPasswordCheck spends the same time as a real check, so unknown accounts are not distinguishable by timing.
func BurnPasswordCheck(p string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(p))
}

// ValidatePassword enforces the password policy: at least 10 characters, with a letter and a digit.
func ValidatePassword(p string) error {
	if len(p) < 10 {
		return errors.New("must be at least 10 characters")
	}
	var letter, digit bool
	for _, r := range p {
		if unicode.IsLetter(r) {
			letter = true
		}
		if unicode.IsDigit(r) {
			digit = true
		}
	}
	if !letter || !digit {
		return errors.New("must contain a letter and a digit")
	}
	return nil
}

const pwAlphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func randIndex(n int) int {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return int(v.Int64())
}

// GeneratePassword returns a random 14-character password that satisfies the policy.
func GeneratePassword() string {
	out := make([]byte, 14)
	for i := range out {
		out[i] = pwAlphabet[randIndex(len(pwAlphabet))]
	}
	out[0] = "abcdefghijkmnpqrstuvwxyz"[randIndex(24)]
	out[1] = "23456789"[randIndex(8)]
	return string(out)
}

// ---- login rate limiter ----

// Limiter blocks a key after max failures inside window.
type Limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string][]time.Time
}

// NewLimiter creates a limiter.
func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, hits: map[string][]time.Time{}}
}

func (l *Limiter) prune(key string) []time.Time {
	cutoff := time.Now().Add(-l.window)
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.hits, key)
		return nil
	}
	l.hits[key] = kept
	return kept
}

// Blocked reports whether the key has reached the failure limit.
func (l *Limiter) Blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key)) >= l.max
}

// Fail records a failure.
func (l *Limiter) Fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.prune(key)
	l.hits[key] = append(l.hits[key], time.Now())
}

// Reset clears a key after a successful login.
func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.hits, key)
}
