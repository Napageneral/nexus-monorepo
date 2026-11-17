package plaid

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode"
)

// DecimalNumber preserves the provider's JSON number lexeme. It never passes
// through a binary floating-point representation.
type DecimalNumber struct {
	raw   string
	valid bool
}

func (n *DecimalNumber) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "null" {
		n.raw = ""
		n.valid = false
		return nil
	}
	canonical, err := canonicalDecimal(trimmed)
	if err != nil {
		return err
	}
	n.raw = canonical
	n.valid = true
	return nil
}

func (n DecimalNumber) Valid() bool {
	return n.valid
}

func (n DecimalNumber) String() string {
	return n.raw
}

// ExactMoney is an accounting-safe representation of a provider amount.
// MinorUnits is a base-10 integer string so values never overflow an int64.
type ExactMoney struct {
	Decimal            string `json:"decimal"`
	MinorUnits         string `json:"minor_units,omitempty"`
	CurrencyCode       string `json:"currency_code,omitempty"`
	CurrencyExponent   *int   `json:"currency_exponent,omitempty"`
	MinorUnitsExact    bool   `json:"minor_units_exact"`
	UnofficialCurrency bool   `json:"unofficial_currency,omitempty"`
}

func exactMoney(number DecimalNumber, isoCurrencyCode string, unofficialCurrencyCode string) (*ExactMoney, error) {
	if !number.Valid() {
		return nil, nil
	}

	code := strings.ToUpper(strings.TrimSpace(isoCurrencyCode))
	unofficial := false
	if code == "" {
		code = strings.TrimSpace(unofficialCurrencyCode)
		unofficial = code != ""
	}

	money := &ExactMoney{
		Decimal:            number.String(),
		CurrencyCode:       code,
		MinorUnitsExact:    false,
		UnofficialCurrency: unofficial,
	}

	exponent, known := currencyExponent(code)
	if !known || unofficial {
		return money, nil
	}
	money.CurrencyExponent = &exponent
	minorUnits, exact, err := decimalToMinorUnits(number.String(), exponent)
	if err != nil {
		return nil, err
	}
	money.MinorUnitsExact = exact
	if exact {
		money.MinorUnits = minorUnits
	}
	return money, nil
}

func currencyExponent(code string) (int, bool) {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "BHD", "JOD", "KWD", "OMR", "TND":
		return 3, true
	case "JPY", "KRW", "VND":
		return 0, true
	case "AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "INR", "MXN", "NZD", "SEK", "SGD", "USD":
		return 2, true
	default:
		return 0, false
	}
}

func canonicalDecimal(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("empty decimal")
	}

	sign := ""
	if s[0] == '-' {
		sign = "-"
		s = s[1:]
	}
	if s == "" {
		return "", fmt.Errorf("invalid decimal %q", raw)
	}

	exponent := 0
	if index := strings.IndexAny(s, "eE"); index >= 0 {
		exponentText := s[index+1:]
		s = s[:index]
		if exponentText == "" {
			return "", fmt.Errorf("invalid decimal exponent %q", raw)
		}
		parsed, err := strconv.Atoi(exponentText)
		if err != nil || parsed < -1000 || parsed > 1000 {
			return "", fmt.Errorf("invalid decimal exponent %q", raw)
		}
		exponent = parsed
	}

	if strings.Count(s, ".") > 1 {
		return "", fmt.Errorf("invalid decimal %q", raw)
	}
	parts := strings.SplitN(s, ".", 2)
	integerPart := parts[0]
	fractionPart := ""
	if len(parts) == 2 {
		fractionPart = parts[1]
	}
	if integerPart == "" || !allDigits(integerPart) || (len(parts) == 2 && (fractionPart == "" || !allDigits(fractionPart))) {
		return "", fmt.Errorf("invalid decimal %q", raw)
	}
	if len(integerPart) > 1 && integerPart[0] == '0' {
		return "", fmt.Errorf("invalid leading zero in decimal %q", raw)
	}

	digits := integerPart + fractionPart
	decimalPosition := len(integerPart) + exponent
	var normalized string
	switch {
	case decimalPosition <= 0:
		normalized = "0." + strings.Repeat("0", -decimalPosition) + digits
	case decimalPosition >= len(digits):
		normalized = digits + strings.Repeat("0", decimalPosition-len(digits))
	default:
		normalized = digits[:decimalPosition] + "." + digits[decimalPosition:]
	}

	parts = strings.SplitN(normalized, ".", 2)
	integerPart = strings.TrimLeft(parts[0], "0")
	if integerPart == "" {
		integerPart = "0"
	}
	fractionPart = ""
	if len(parts) == 2 {
		fractionPart = strings.TrimRight(parts[1], "0")
	}
	normalized = integerPart
	if fractionPart != "" {
		normalized += "." + fractionPart
	}
	if normalized == "0" {
		sign = ""
	}
	return sign + normalized, nil
}

func decimalToMinorUnits(decimal string, exponent int) (string, bool, error) {
	if exponent < 0 || exponent > 9 {
		return "", false, fmt.Errorf("unsupported currency exponent %d", exponent)
	}
	canonical, err := canonicalDecimal(decimal)
	if err != nil {
		return "", false, err
	}
	sign := ""
	if strings.HasPrefix(canonical, "-") {
		sign = "-"
		canonical = strings.TrimPrefix(canonical, "-")
	}
	parts := strings.SplitN(canonical, ".", 2)
	integerPart := parts[0]
	fractionPart := ""
	if len(parts) == 2 {
		fractionPart = parts[1]
	}

	if len(fractionPart) > exponent {
		extra := fractionPart[exponent:]
		if strings.Trim(extra, "0") != "" {
			return "", false, nil
		}
		fractionPart = fractionPart[:exponent]
	}
	fractionPart += strings.Repeat("0", exponent-len(fractionPart))
	minor := strings.TrimLeft(integerPart+fractionPart, "0")
	if minor == "" {
		minor = "0"
		sign = ""
	}
	return sign + minor, true, nil
}

func allDigits(value string) bool {
	for _, char := range value {
		if !unicode.IsDigit(char) || char > unicode.MaxASCII {
			return false
		}
	}
	return value != ""
}

func canonicalJSON(raw json.RawMessage) ([]byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	return json.Marshal(value)
}
