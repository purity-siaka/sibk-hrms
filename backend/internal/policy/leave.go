package policy

import "time"

// IsWeekend reports whether t is a Saturday or Sunday.
func IsWeekend(t time.Time) bool {
	d := t.Weekday()
	return d == time.Saturday || d == time.Sunday
}

// WorkingDays counts Monday to Friday days from..to inclusive, skipping days for which
// isHoliday returns true. It returns 0 when to is before from.
func WorkingDays(from, to time.Time, isHoliday func(time.Time) bool) float64 {
	if to.Before(from) {
		return 0
	}
	n := 0
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if IsWeekend(d) || (isHoliday != nil && isHoliday(d)) {
			continue
		}
		n++
	}
	return float64(n)
}

// Overlaps reports whether the ranges a1..a2 and b1..b2 share at least one day.
func Overlaps(a1, a2, b1, b2 time.Time) bool { return !a2.Before(b1) && !b2.Before(a1) }
