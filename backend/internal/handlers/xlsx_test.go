package handlers

import (
	"archive/zip"
	"bytes"
	"os"
	"testing"
)

func TestXLSXBuilds(t *testing.T) {
	rows := [][]string{{"Employee", "Days", "Reason"}, {"A & B <x>", "2.5", "007"}, {"C", "0", ""}}
	b := xlsxBytes("Leave: report/1", rows)
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil || len(zr.File) != 6 {
		t.Fatalf("bad zip: %v %d", err, len(zr.File))
	}
	if p := os.Getenv("XLSX_OUT"); p != "" {
		_ = os.WriteFile(p, b, 0o644)
	}
}

func TestIsPlainNumber(t *testing.T) {
	for v, want := range map[string]bool{"12": true, "3.5": true, "0": true, "0.5": true, "007": false, "+254": false, "": false, "abc": false, "-1": true} {
		if isPlainNumber(v) != want {
			t.Errorf("%q", v)
		}
	}
}
