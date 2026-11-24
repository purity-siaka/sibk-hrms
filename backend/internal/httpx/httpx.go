// Package httpx holds small HTTP helpers: JSON, errors, pagination and middleware.
package httpx

import (
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

// Error is an error that carries an HTTP status and an optional per-field message map.
type Error struct {
	Status  int
	Message string
	Fields  map[string]string
}

func (e *Error) Error() string { return e.Message }

// NewError builds an Error.
func NewError(status int, msg string) *Error { return &Error{Status: status, Message: msg} }

// BadRequest is a 400.
func BadRequest(msg string) *Error { return NewError(http.StatusBadRequest, msg) }

// Invalid is a 422 with field messages.
func Invalid(fields map[string]string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Message: "validation failed", Fields: fields}
}

// Unauthorized is a 401.
func Unauthorized(msg string) *Error { return NewError(http.StatusUnauthorized, msg) }

// Forbidden is a 403.
func Forbidden() *Error { return NewError(http.StatusForbidden, "you do not have access to this") }

// NotFound is a 404.
func NotFound(what string) *Error { return NewError(http.StatusNotFound, what+" not found") }

// Conflict is a 409.
func Conflict(msg string) *Error { return NewError(http.StatusConflict, msg) }

// JSON writes v as JSON with the given status.
func JSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode: %v", err)
	}
}

// WriteError renders err as JSON. Unknown errors become a generic 500 and are logged.
func WriteError(w http.ResponseWriter, err error) {
	var he *Error
	if errors.As(err, &he) {
		body := map[string]interface{}{"error": he.Message}
		if len(he.Fields) > 0 {
			body["fields"] = he.Fields
		}
		JSON(w, he.Status, body)
		return
	}
	log.Printf("internal error: %v", err)
	JSON(w, http.StatusInternalServerError, map[string]string{"error": "something went wrong, please try again"})
}

// Decode reads a JSON body (max 1 MB) into dst.
func Decode(w http.ResponseWriter, r *http.Request, dst interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		return BadRequest("the request body is not valid JSON")
	}
	return nil
}

// Page reads page and pageSize query parameters (default size 24, max 100).
func Page(r *http.Request) (page, size, offset int) {
	page, _ = strconv.Atoi(r.URL.Query().Get("page"))
	size, _ = strconv.Atoi(r.URL.Query().Get("pageSize"))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 24
	}
	if size > 100 {
		size = 100
	}
	return page, size, (page - 1) * size
}

// ClientIP returns the caller's IP address (first X-Forwarded-For entry when present).
func ClientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		return strings.TrimSpace(strings.Split(xf, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Middleware wraps a handler.
type Middleware func(http.Handler) http.Handler

// Chain applies middleware so that the first one listed is the outermost.
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// Recoverer turns panics into 500 responses.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic: %v\n%s", rec, debug.Stack())
				JSON(w, http.StatusInternalServerError, map[string]string{"error": "something went wrong, please try again"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Logger logs one line per request.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

// SecurityHeaders adds conservative security headers to every response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

// CORS allows the configured origin to call the API with credentials-free bearer tokens.
func CORS(origin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Origin") == origin {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Vary", "Origin")
				h.Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
				h.Set("Access-Control-Expose-Headers", "Content-Disposition")
				h.Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CSVEscape quotes a CSV cell and neutralises spreadsheet formula injection.
func CSVEscape(s string) string {
	if s != "" && strings.ContainsAny(s[:1], "=+-@\t\r") {
		s = "'" + s
	}
	if strings.ContainsAny(s, ",\"\n\r") {
		s = "\"" + strings.ReplaceAll(s, "\"", "\"\"") + "\""
	}
	return s
}
