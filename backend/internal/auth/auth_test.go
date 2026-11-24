package auth

import (
	"strings"
	"testing"
	"time"
)

const secret = "0123456789abcdef0123456789abcdef"

func TestTokenRoundTrip(t *testing.T) {
	tok, err := Sign(secret, 7, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	id, err := Verify(secret, tok)
	if err != nil || id != 7 {
		t.Fatalf("id=%d err=%v", id, err)
	}
}

func TestTokenRejectsTamperingExpiryAndWrongSecret(t *testing.T) {
	tok, _ := Sign(secret, 7, time.Hour)
	parts := strings.Split(tok, ".")
	forged, _ := Sign(secret, 8, time.Hour)
	fp := strings.Split(forged, ".")
	cases := map[string]string{
		"payload swapped": parts[0] + "." + fp[1] + "." + parts[2],
		"no signature":    parts[0] + "." + parts[1] + ".",
		"garbage":         "abc",
	}
	for name, tk := range cases {
		if _, err := Verify(secret, tk); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	if _, err := Verify("another-secret-another-secret-12345", tok); err == nil {
		t.Error("wrong secret accepted")
	}
	expired, _ := Sign(secret, 7, -time.Minute)
	if _, err := Verify(secret, expired); err == nil {
		t.Error("expired token accepted")
	}
}

func TestValidatePassword(t *testing.T) {
	for p, ok := range map[string]bool{"short1": false, "alllettersonly": false, "1234567890123": false, "Valid-pass-123": true} {
		if (ValidatePassword(p) == nil) != ok {
			t.Errorf("%q expected ok=%v", p, ok)
		}
	}
}

func TestGeneratedPasswordSatisfiesPolicy(t *testing.T) {
	for i := 0; i < 50; i++ {
		if err := ValidatePassword(GeneratePassword()); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLimiter(t *testing.T) {
	l := NewLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if l.Blocked("k") {
			t.Fatal("blocked too early")
		}
		l.Fail("k")
	}
	if !l.Blocked("k") {
		t.Fatal("should be blocked")
	}
	if l.Blocked("other") {
		t.Fatal("keys must be independent")
	}
	l.Reset("k")
	if l.Blocked("k") {
		t.Fatal("reset failed")
	}
}

func TestActorRoles(t *testing.T) {
	id := uint(5)
	a := &Actor{Role: "hr_officer", EmployeeID: &id}
	if !a.IsHR() || a.IsAdmin() || !a.IsEmployee(5) || a.IsEmployee(6) {
		t.Fatal("role helpers wrong")
	}
}
