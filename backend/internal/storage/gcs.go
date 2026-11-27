package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	gcs "cloud.google.com/go/storage"
)

// GCS stores uploads in a Google Cloud Storage bucket.
type GCS struct {
	client *gcs.Client
	bucket *gcs.BucketHandle
}

// NewGCS creates a GCS store using Google Application Default Credentials.
func NewGCS(bucket string) (*GCS, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, errors.New("GCS bucket name is required")
	}
	client, err := gcs.NewClient(context.Background())
	if err != nil {
		return nil, fmt.Errorf("create GCS client: %w", err)
	}
	return &GCS{client: client, bucket: client.Bucket(bucket)}, nil
}

// Close releases the underlying Google Cloud client.
func (s *GCS) Close() error {
	return s.client.Close()
}

func validObjectKey(key string) bool {
	return key != "" && !strings.Contains(key, "\\") && !path.IsAbs(key) && path.Clean(key) == key && key != "."
}

// Save validates and writes an upload to the bucket under a random object name.
func (s *GCS) Save(r io.Reader, filename string, max int64, kind Kind) (Saved, error) {
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

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := s.bucket.Object(key).NewWriter(ctx)
	writer.ContentType = ctype
	if _, err := writer.Write(head); err != nil {
		cancel()
		return Saved{}, err
	}
	rest, err := io.Copy(writer, io.LimitReader(r, max-int64(n)+1))
	if err != nil {
		cancel()
		return Saved{}, err
	}
	total := int64(n) + rest
	if total > max {
		cancel()
		return Saved{}, ErrTooLarge
	}
	if err := writer.Close(); err != nil {
		return Saved{}, err
	}
	return Saved{Key: key, ContentType: ctype, Size: total}, nil
}

type temporaryFile struct {
	*os.File
	name string
}

func (f *temporaryFile) Close() error {
	closeErr := f.File.Close()
	removeErr := os.Remove(f.name)
	if closeErr != nil {
		return closeErr
	}
	if removeErr != nil && !os.IsNotExist(removeErr) {
		return removeErr
	}
	return nil
}

// Open downloads an object to a temporary file to provide the seekable file
// required by http.ServeContent. The temporary file is removed on Close.
func (s *GCS) Open(key string) (File, error) {
	if !validObjectKey(key) {
		return nil, errors.New("invalid storage key")
	}
	reader, err := s.bucket.Object(key).NewReader(context.Background())
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	file, err := os.CreateTemp("", "sibk-hrms-gcs-*")
	if err != nil {
		return nil, err
	}
	removeFile := func() {
		_ = file.Close()
		_ = os.Remove(file.Name())
	}
	if _, err := io.Copy(file, reader); err != nil {
		removeFile()
		return nil, err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		removeFile()
		return nil, err
	}
	return &temporaryFile{File: file, name: file.Name()}, nil
}

// Delete removes an object. Deleting a missing object is not an error.
func (s *GCS) Delete(key string) error {
	if key == "" {
		return nil
	}
	if !validObjectKey(key) {
		return errors.New("invalid storage key")
	}
	err := s.bucket.Object(key).Delete(context.Background())
	if errors.Is(err, gcs.ErrObjectNotExist) {
		return nil
	}
	return err
}
