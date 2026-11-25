// Package mail sends notification emails over SMTP. When SMTP is not configured it only logs.
package mail

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
)

// Config is the SMTP setup.
type Config struct {
	Host, Port, User, Pass string
	From                   string // address, e.g. it@salaaminvestments.com
	FromName               string // display name, e.g. IT Department
	Auth                   string // "plain" (default) or "login" (some Microsoft 365 setups)
}

// Attachment is a file sent with a message.
type Attachment struct {
	Name, ContentType string
	Data              []byte
}

// Mailer sends email. The zero value is disabled.
type Mailer struct{ cfg Config }

// New creates a Mailer.
func New(c Config) *Mailer { return &Mailer{cfg: c} }

// Enabled reports whether SMTP is configured.
func (m *Mailer) Enabled() bool { return m != nil && m.cfg.Host != "" && m.cfg.From != "" }

// ErrDisabled is returned by Send when SMTP is not configured.
var ErrDisabled = errors.New("email is not configured on this server")

// Go sends in the background; failures are logged, never shown to the user.
func (m *Mailer) Go(to []string, subject, body string) {
	to = clean(to)
	if len(to) == 0 {
		return
	}
	if !m.Enabled() {
		log.Printf("mail (not sent, SMTP not configured): to=%v subject=%q", to, subject)
		return
	}
	go func() {
		if err := m.Send(to, subject, body, nil); err != nil {
			log.Printf("mail to %v failed: %v", to, err)
		}
	}()
}

func clean(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, a := range in {
		a = strings.TrimSpace(a)
		if _, err := mail.ParseAddress(a); err != nil || seen[strings.ToLower(a)] {
			continue
		}
		seen[strings.ToLower(a)] = true
		out = append(out, a)
	}
	return out
}

// header values must not carry line breaks.
func safe(s string) string { return strings.NewReplacer("\r", " ", "\n", " ").Replace(s) }

// Send sends a plain-text message, with an optional attachment.
func (m *Mailer) Send(to []string, subject, body string, att *Attachment) error {
	if !m.Enabled() {
		return ErrDisabled
	}
	to = clean(to)
	if len(to) == 0 {
		return errors.New("no valid recipient")
	}
	from := mail.Address{Name: m.cfg.FromName, Address: m.cfg.From}
	var b bytes.Buffer
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n", from.String(), strings.Join(to, ", "), mimeWord(safe(subject)))
	if att == nil {
		b.WriteString("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrap64([]byte(body)))
	} else {
		var rnd [12]byte
		_, _ = rand.Read(rnd[:])
		bd := "sibk" + hex.EncodeToString(rnd[:])
		fmt.Fprintf(&b, "Content-Type: multipart/mixed; boundary=%s\r\n\r\n--%s\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", bd, bd, wrap64([]byte(body)))
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=%q\r\n\r\n%s\r\n--%s--\r\n", bd, att.ContentType, safe(att.Name), wrap64(att.Data), bd)
	}
	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)
	var auth smtp.Auth
	if m.cfg.User != "" {
		if strings.EqualFold(m.cfg.Auth, "login") {
			auth = loginAuth{m.cfg.User, m.cfg.Pass}
		} else {
			auth = smtp.PlainAuth("", m.cfg.User, m.cfg.Pass, m.cfg.Host)
		}
	}
	return smtp.SendMail(addr, auth, m.cfg.From, to, b.Bytes())
}

func mimeWord(s string) string {
	for _, r := range s {
		if r > 126 {
			return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
		}
	}
	return s
}

func wrap64(data []byte) string {
	enc := base64.StdEncoding.EncodeToString(data)
	var sb strings.Builder
	for len(enc) > 76 {
		sb.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	sb.WriteString(enc)
	return sb.String()
}

type loginAuth struct{ user, pass string }

func (a loginAuth) Start(*smtp.ServerInfo) (string, []byte, error) { return "LOGIN", nil, nil }
func (a loginAuth) Next(from []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(from))) {
	case "username:":
		return []byte(a.user), nil
	case "password:":
		return []byte(a.pass), nil
	}
	return nil, errors.New("unexpected server challenge")
}
