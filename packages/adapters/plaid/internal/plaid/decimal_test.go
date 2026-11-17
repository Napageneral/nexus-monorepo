package plaid

import (
	"encoding/json"
	"testing"
)

func TestDecimalNumberAndMinorUnitsStayExact(t *testing.T) {
	t.Parallel()
	tests := []struct {
		input     string
		canonical string
		exponent  int
		minor     string
		exact     bool
	}{
		{input: "67578.06", canonical: "67578.06", exponent: 2, minor: "6757806", exact: true},
		{input: "0.1", canonical: "0.1", exponent: 2, minor: "10", exact: true},
		{input: "1e3", canonical: "1000", exponent: 2, minor: "100000", exact: true},
		{input: "-0.005", canonical: "-0.005", exponent: 2, minor: "", exact: false},
		{input: "100000.001", canonical: "100000.001", exponent: 2, minor: "", exact: false},
		{input: "123456789012345678901234567890.12", canonical: "123456789012345678901234567890.12", exponent: 2, minor: "12345678901234567890123456789012", exact: true},
	}
	for _, test := range tests {
		test := test
		t.Run(test.input, func(t *testing.T) {
			t.Parallel()
			var number DecimalNumber
			if err := json.Unmarshal([]byte(test.input), &number); err != nil {
				t.Fatalf("unmarshal decimal: %v", err)
			}
			if number.String() != test.canonical {
				t.Fatalf("canonical decimal = %q, want %q", number.String(), test.canonical)
			}
			minor, exact, err := decimalToMinorUnits(number.String(), test.exponent)
			if err != nil {
				t.Fatalf("minor units: %v", err)
			}
			if exact != test.exact || minor != test.minor {
				t.Fatalf("minor units = (%q, %v), want (%q, %v)", minor, exact, test.minor, test.exact)
			}
		})
	}
}

func TestExactMoneyDoesNotGuessUnknownCurrencyExponent(t *testing.T) {
	t.Parallel()
	var number DecimalNumber
	if err := json.Unmarshal([]byte("12.345"), &number); err != nil {
		t.Fatal(err)
	}
	money, err := exactMoney(number, "ZZZ", "")
	if err != nil {
		t.Fatal(err)
	}
	if money.Decimal != "12.345" || money.MinorUnits != "" || money.MinorUnitsExact {
		t.Fatalf("unexpected unknown-currency normalization: %+v", money)
	}
}
