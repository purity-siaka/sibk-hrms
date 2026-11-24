.PHONY: run build test tidy
tidy:
	go mod tidy
build: tidy
	go build ./...
test:
	go test ./...
run:
	go run ./cmd/server
