package catalog

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
)

//go:embed operations.catalog.json
var rawCatalog []byte

type Operation struct {
	OperationID string `json:"operation_id"`
	HTTPMethod  string `json:"http_method"`
	Path        string `json:"path"`
	Visibility  string `json:"visibility"`
}

func Operations() ([]Operation, error) {
	var operations []Operation
	if err := json.Unmarshal(rawCatalog, &operations); err != nil {
		return nil, fmt.Errorf("decode Mercury operation catalog: %w", err)
	}
	if len(operations) != 84 {
		return nil, fmt.Errorf("Mercury operation catalog contains %d rows, expected 84", len(operations))
	}
	if !sort.SliceIsSorted(operations, func(i, j int) bool {
		return operations[i].OperationID < operations[j].OperationID
	}) {
		return nil, fmt.Errorf("Mercury operation catalog is not sorted")
	}
	seen := make(map[string]struct{}, len(operations))
	public := 0
	internal := 0
	for _, operation := range operations {
		if operation.OperationID == "" || operation.HTTPMethod == "" || operation.Path == "" {
			return nil, fmt.Errorf("Mercury operation catalog contains an incomplete row")
		}
		if _, ok := seen[operation.OperationID]; ok {
			return nil, fmt.Errorf("duplicate Mercury operation id %q", operation.OperationID)
		}
		seen[operation.OperationID] = struct{}{}
		switch operation.Visibility {
		case "public":
			public++
		case "internal":
			internal++
		default:
			return nil, fmt.Errorf("invalid visibility for Mercury operation %q", operation.OperationID)
		}
	}
	if public != 72 || internal != 12 {
		return nil, fmt.Errorf("Mercury operation visibility counts are %d/%d, expected 72/12", public, internal)
	}
	return operations, nil
}

func MustOperations() []Operation {
	operations, err := Operations()
	if err != nil {
		panic(err)
	}
	return operations
}
