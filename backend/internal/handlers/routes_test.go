package handlers

import "testing"

// Go's ServeMux panics at registration when two patterns can match the same request.
// This test makes such a mistake fail in `go test` instead of at server start.
func TestRoutesRegister(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("route registration panicked: %v", r)
		}
	}()
	a := &App{}
	if a.Routes() == nil {
		t.Fatal("no mux")
	}
}
