package mail

import "testing"

func TestCleanDropsInvalidAndDuplicates(t *testing.T) {
	got := clean([]string{"hr@salaaminvestments.com", "HR@salaaminvestments.com", "not an email", "", " a@b.co "})
	if len(got) != 2 || got[0] != "hr@salaaminvestments.com" || got[1] != "a@b.co" {
		t.Fatalf("got %v", got)
	}
}

func TestDisabledMailer(t *testing.T) {
	m := New(Config{})
	if m.Enabled() {
		t.Fatal("must be disabled")
	}
	if err := m.Send([]string{"a@b.co"}, "s", "b", nil); err != ErrDisabled {
		t.Fatalf("got %v", err)
	}
}

func TestSafeStripsLineBreaks(t *testing.T) {
	if s := safe("a\r\nBcc: x"); s != "a  Bcc: x" {
		t.Fatalf("got %q", s)
	}
}
