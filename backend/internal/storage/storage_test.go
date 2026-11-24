package storage

import (
	"bytes"
	"errors"
	"testing"
)

var pdf = []byte("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
var png = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)

func TestSaveAcceptsPDFAndRejectsRenamedExecutable(t *testing.T) {
	d, err := NewDisk(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s, err := d.Save(bytes.NewReader(pdf), "cv.pdf", 1<<20, Any)
	if err != nil || s.ContentType != "application/pdf" {
		t.Fatalf("pdf: %v %+v", err, s)
	}
	if _, err := d.Save(bytes.NewReader([]byte("MZ\x90\x00 not a document")), "cv.pdf", 1<<20, Any); !errors.Is(err, ErrType) {
		t.Fatalf("expected ErrType, got %v", err)
	}
}

func TestSaveEnforcesSizeAndKind(t *testing.T) {
	d, _ := NewDisk(t.TempDir())
	if _, err := d.Save(bytes.NewReader(append(pdf, make([]byte, 2000)...)), "a.pdf", 100, Any); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
	if _, err := d.Save(bytes.NewReader(pdf), "a.pdf", 1<<20, ImageOnly); !errors.Is(err, ErrType) {
		t.Fatalf("pdf must not pass as a photo: %v", err)
	}
	if _, err := d.Save(bytes.NewReader(png), "p.png", 1<<20, ImageOnly); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Save(bytes.NewReader(nil), "e.pdf", 10, Any); !errors.Is(err, ErrEmpty) {
		t.Fatalf("expected ErrEmpty, got %v", err)
	}
}

func TestOpenRejectsPathTraversal(t *testing.T) {
	d, _ := NewDisk(t.TempDir())
	if _, err := d.Open("../../etc/passwd"); err == nil {
		t.Fatal("traversal allowed")
	}
}
