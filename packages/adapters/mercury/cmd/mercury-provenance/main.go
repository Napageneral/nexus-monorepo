package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/nexus-project/adapter-mercury/internal/provenance"
)

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "mercury-provenance: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, input io.Reader, output io.Writer) error {
	if len(args) != 1 {
		return errors.New("usage: mercury-provenance <extract|resolve|project>")
	}
	decoder := json.NewDecoder(bufio.NewReader(input))
	decoder.UseNumber()
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	switch args[0] {
	case "extract":
		records, err := decodeRecords(decoder)
		if err != nil {
			return err
		}
		result, err := provenance.Extract(records)
		if err != nil {
			return err
		}
		return encoder.Encode(result)
	case "resolve":
		var payload struct {
			Facts             []provenance.Fact        `json:"facts"`
			Requirements      []provenance.Requirement `json:"requirements"`
			PriorObservations []provenance.Observation `json:"prior_observations"`
			ResolutionAt      string                   `json:"resolution_at"`
		}
		if err := decoder.Decode(&payload); err != nil {
			return fmt.Errorf("decode resolution input: %w", err)
		}
		result, err := provenance.Resolve(
			payload.Facts,
			payload.Requirements,
			payload.PriorObservations,
			payload.ResolutionAt,
		)
		if err != nil {
			return err
		}
		return encoder.Encode(result)
	case "project":
		var payload provenance.ProjectInput
		if err := decoder.Decode(&payload); err != nil {
			return fmt.Errorf("decode project input: %w", err)
		}
		result, err := provenance.Project(payload)
		if err != nil {
			return err
		}
		return encoder.Encode(result)
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func decodeRecords(decoder *json.Decoder) ([]provenance.StoredRecord, error) {
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode extraction input: %w", err)
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil, errors.New("extraction input is empty")
	}
	if strings.HasPrefix(trimmed, "[") {
		var records []provenance.StoredRecord
		if err := decodeRaw(raw, &records); err != nil {
			return nil, err
		}
		return records, nil
	}
	var wrapper struct {
		Records []provenance.StoredRecord `json:"records"`
	}
	if err := decodeRaw(raw, &wrapper); err != nil {
		return nil, err
	}
	if wrapper.Records == nil {
		return nil, errors.New("extraction input omitted records")
	}
	return wrapper.Records, nil
}

func decodeRaw(raw json.RawMessage, target any) error {
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode JSON: %w", err)
	}
	return nil
}
