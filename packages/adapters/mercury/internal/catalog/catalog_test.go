package catalog

import "testing"

func TestCatalogExactCoverage(t *testing.T) {
	operations, err := Operations()
	if err != nil {
		t.Fatal(err)
	}
	if len(operations) != 84 {
		t.Fatalf("operations = %d, want 84", len(operations))
	}
	public := 0
	internal := 0
	for _, operation := range operations {
		switch operation.Visibility {
		case "public":
			public++
		case "internal":
			internal++
		}
	}
	if public != 72 || internal != 12 {
		t.Fatalf("visibility counts = %d/%d, want 72/12", public, internal)
	}
	if operations[0].OperationID != "cancelCard" {
		t.Fatalf("first operation = %q", operations[0].OperationID)
	}
	if operations[len(operations)-1].OperationID != "verifyWebhook" {
		t.Fatalf("last operation = %q", operations[len(operations)-1].OperationID)
	}
}
