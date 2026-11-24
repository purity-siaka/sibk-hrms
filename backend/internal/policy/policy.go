// Package policy holds pure HR Policy rules (dates and limits) so they can be unit tested.
package policy

import "time"

const (
	// ProbationMonths is the standard probation length (HR Policy).
	ProbationMonths = 3
	// ProbationExtensionMonths is the single permitted extension.
	ProbationExtensionMonths = 3
	// RecordRetentionYears is the minimum retention for recruitment records.
	RecordRetentionYears = 6
	// ExpiryWindowDays is the look-ahead for expiring documents, probation and contracts.
	ExpiryWindowDays = 60
	// AnniversaryWindowDays is the look-ahead for work anniversaries.
	AnniversaryWindowDays = 30
	// FinalDuesWorkingDays is the deadline for paying final dues after exit.
	FinalDuesWorkingDays = 7
)

// eat is East Africa Time (UTC+3, no daylight saving).
var eat = time.FixedZone("EAT", 3*60*60)

// Today returns today's calendar date in Kenya as midnight UTC, comparable with stored dates.
func Today() time.Time {
	n := time.Now().In(eat)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC)
}

// AddMonths adds n calendar months and clamps the day to the end of the target month
// (31 Jan + 1 month = 28/29 Feb, never 2/3 March).
func AddMonths(t time.Time, n int) time.Time {
	y, m, d := t.Date()
	first := time.Date(y, m, 1, 0, 0, 0, 0, t.Location()).AddDate(0, n, 0)
	last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, t.Location()).Day()
	if d > last {
		d = last
	}
	return time.Date(first.Year(), first.Month(), d, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}

// ProbationEnd returns the end of the standard probation period.
func ProbationEnd(start time.Time) time.Time {
	return AddMonths(start, ProbationMonths)
}

// ExtendProbation returns the end date after the one permitted extension.
func ExtendProbation(currentEnd time.Time) time.Time {
	return AddMonths(currentEnd, ProbationExtensionMonths)
}

// IsProbationary reports whether an employment type serves a probation period.
func IsProbationary(employmentType string) bool {
	return employmentType == "permanent" || employmentType == "fixed_term"
}

// DaysBetween returns whole days from a to b (negative when b is before a).
func DaysBetween(a, b time.Time) int {
	a = time.Date(a.Year(), a.Month(), a.Day(), 0, 0, 0, 0, time.UTC)
	b = time.Date(b.Year(), b.Month(), b.Day(), 0, 0, 0, 0, time.UTC)
	return int(b.Sub(a).Hours() / 24)
}

// ParseDate parses a YYYY-MM-DD string.
func ParseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}

// FormatDate formats as YYYY-MM-DD.
func FormatDate(t time.Time) string {
	return t.Format("2006-01-02")
}

// NextAnniversary returns the next occurrence (today or later) of the start date's day and month,
// and the number of completed years at that date.
func NextAnniversary(start, today time.Time) (time.Time, int) {
	next := time.Date(today.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	if next.Before(today) {
		next = time.Date(today.Year()+1, start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	}
	return next, next.Year() - start.Year()
}
