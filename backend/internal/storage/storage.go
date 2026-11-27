// Package storage stores uploaded files on disk under random names.
package storage

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Kind restricts what may be uploaded.
type Kind int

const (
	// Any allows PDF, JPEG, PNG and DOCX.
	Any Kind = iota
	// ImageOnly allows JPEG and PNG.
	ImageOnly
	// Viewable allows PDF, JPEG and PNG: files the sign-off viewer can render.
	Viewable
)

// Errors returned by Save.
var (
	ErrTooLarge = errors.New("file is too large")
	ErrType     = errors.New("file type is not allowed")
	ErrEmpty    = errors.New("file is empty")
)

// Saved describes a stored file.
type Saved struct {
	Key         string
	ContentType string
	Size        int64
}

// File is what Open returns: enough for http.ServeContent. *os.File satisfies it.
type File interface {
	io.ReadSeeker
	io.Closer
	Stat() (os.FileInfo, error)
}

// Store is where files live. An S3 implementation can replace Disk without touching handlers.
type Store interface {
	Save(r io.Reader, filename string, max int64, kind Kind) (Saved, error)
	Open(key string) (File, error)
	Delete(key string) error
}

// Disk keeps files in a directory outside any web root.
type Disk struct{ dir string }

// NewDisk creates the directory if needed.
func NewDisk(dir string) (*Disk, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, err
	}
	return &Disk{dir: abs}, nil
}

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

func classify(sniffed, ext string, kind Kind) (string, string, bool) {
	switch {
	case strings.HasPrefix(sniffed, "image/jpeg"):
		return ".jpg", "image/jpeg", true
	case strings.HasPrefix(sniffed, "image/png"):
		return ".png", "image/png", true
	case (kind == Any || kind == Viewable) && strings.HasPrefix(sniffed, "application/pdf"):
		return ".pdf", "application/pdf", true
	case kind == Any && strings.HasPrefix(sniffed, "application/zip") && ext == ".docx":
		return ".docx", docxType, true
	}
	return "", "", false
}

// Save validates the content by sniffing it (never trusting the filename) and stores it.
func (d *Disk) Save(r io.Reader, filename string, max int64, kind Kind) (Saved, error) {
	head := make([]byte, 512)
	n, err := io.ReadFull(r, head)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return Saved{}, err
	}
	if n == 0 {
		return Saved{}, ErrEmpty
	}
	head = head[:n]
	ext, ctype, ok := classify(http.DetectContentType(head), strings.ToLower(filepath.Ext(filename)), kind)
	if !ok {
		return Saved{}, ErrType
	}
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return Saved{}, err
	}
	name := hex.EncodeToString(raw)
	key := name[:2] + "/" + name + ext
	path := filepath.Join(d.dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return Saved{}, err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return Saved{}, err
	}
	if _, err := f.Write(head); err != nil {
		f.Close()
		os.Remove(path)
		return Saved{}, err
	}
	rest, err := io.Copy(f, io.LimitReader(r, max-int64(n)+1))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(path)
		return Saved{}, err
	}
	total := int64(n) + rest
	if total > max {
		os.Remove(path)
		return Saved{}, ErrTooLarge
	}
	return Saved{Key: key, ContentType: ctype, Size: total}, nil
}

func (d *Disk) resolve(key string) (string, error) {
	p := filepath.Join(d.dir, filepath.FromSlash(key))
	if !strings.HasPrefix(p, d.dir+string(os.PathSeparator)) {
		return "", errors.New("invalid storage key")
	}
	return p, nil
}

// Open opens a stored file.
func (d *Disk) Open(key string) (File, error) {
	p, err := d.resolve(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	return f, nil
}

// Delete removes a stored file; a missing file is not an error.
func (d *Disk) Delete(key string) error {
	if key == "" {
		return nil
	}
	p, err := d.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
