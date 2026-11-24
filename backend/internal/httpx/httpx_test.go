package httpx

import "testing"

func TestCSVEscape(t *testing.T) {
	cases := map[string]string{
		"plain":       "plain",
		"a,b":         `"a,b"`,
		`say "hi"`:    `"say ""hi"""`,
		"=SUM(A1)":    "'=SUM(A1)",
		"@cmd":        "'@cmd",
		"":            "",
		"line\nbreak": "\"line\nbreak\"",
	}
	for in, want := range cases {
		if got := CSVEscape(in); got != want {
			t.Errorf("CSVEscape(%q)=%q want %q", in, got, want)
		}
	}
}
