package policy

import (
	"testing"
	"time"
)

func dt(s string) time.Time {
	t, err := ParseDate(s)
	if err != nil {
		panic(err)
	}
	return t
}

// The expected counts are the real requests already recorded in SIBK's leave log.
func TestWorkingDaysMatchesRecordedRequests(t *testing.T) {
	cases := []struct {
		from, to string
		want     float64
	}{
		{"2026-11-04", "2026-11-11", 6}, // Purity
		{"2026-11-09", "2026-11-16", 6}, // Carol
		{"2026-11-13", "2026-11-16", 2}, // Geoffrey
		{"2026-11-20", "2026-11-23", 2}, // Moses
		{"2026-11-23", "2026-11-26", 4}, // Dennis
		{"2026-11-17", "2026-11-17", 1},
	}
	for _, c := range cases {
		if got := WorkingDays(dt(c.from), dt(c.to), nil); got != c.want {
			t.Errorf("%s..%s = %v, want %v", c.from, c.to, got, c.want)
		}
	}
}

func TestWorkingDaysSkipsHolidaysAndWeekends(t *testing.T) {
	hol := func(x time.Time) bool { return x.Format("2006-01-02") == "2026-12-25" }
	if got := WorkingDays(dt("2026-12-24"), dt("2026-12-28"), hol); got != 2 { // Thu, Mon
		t.Errorf("got %v want 2", got)
	}
	if WorkingDays(dt("2026-11-10"), dt("2026-11-09"), nil) != 0 {
		t.Error("reversed range must be 0")
	}
	if WorkingDays(dt("2026-11-14"), dt("2026-11-15"), nil) != 0 {
		t.Error("weekend only must be 0")
	}
}

func TestOverlaps(t *testing.T) {
	if !Overlaps(dt("2026-11-01"), dt("2026-11-05"), dt("2026-11-05"), dt("2026-11-09")) {
		t.Error("touching ranges overlap")
	}
	if Overlaps(dt("2026-11-01"), dt("2026-11-04"), dt("2026-11-05"), dt("2026-11-09")) {
		t.Error("disjoint ranges must not overlap")
	}
}
