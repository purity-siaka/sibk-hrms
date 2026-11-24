package policy

import (
	"testing"
	"time"
)

func d(y int, m time.Month, day int) time.Time { return time.Date(y, m, day, 0, 0, 0, 0, time.UTC) }

func TestProbationEndClampsToMonthEnd(t *testing.T) {
	if got := ProbationEnd(d(2026, 11, 30)); !got.Equal(d(2027, 2, 28)) {
		t.Fatalf("got %v", got)
	}
	if got := ProbationEnd(d(2026, 1, 15)); !got.Equal(d(2026, 4, 15)) {
		t.Fatalf("got %v", got)
	}
}

func TestExtendProbationAddsThreeMonths(t *testing.T) {
	if got := ExtendProbation(d(2026, 4, 15)); !got.Equal(d(2026, 7, 15)) {
		t.Fatalf("got %v", got)
	}
}

func TestNextAnniversary(t *testing.T) {
	next, years := NextAnniversary(d(2020, 12, 1), d(2026, 11, 23))
	if !next.Equal(d(2026, 12, 1)) || years != 6 {
		t.Fatalf("got %v %d", next, years)
	}
	next, years = NextAnniversary(d(2020, 11, 1), d(2026, 11, 23))
	if !next.Equal(d(2027, 11, 1)) || years != 7 {
		t.Fatalf("got %v %d", next, years)
	}
}

func TestDaysBetween(t *testing.T) {
	if n := DaysBetween(d(2026, 11, 23), d(2026, 12, 23)); n != 30 {
		t.Fatalf("got %d", n)
	}
}

func TestIsProbationary(t *testing.T) {
	if !IsProbationary("permanent") || IsProbationary("intern") {
		t.Fatal("unexpected probationary rule")
	}
}
