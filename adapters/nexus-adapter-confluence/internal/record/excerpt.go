package record

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	cdataPattern = regexp.MustCompile(`<!\[CDATA\[(?s:(.*?))\]\]>`)
	tagPattern   = regexp.MustCompile(`(?s)<[^>]+>`)
)

func ExtractExcerpt(storageFormatHTML string, maxChars int) string {
	if maxChars <= 0 {
		maxChars = 500
	}

	text := cdataPattern.ReplaceAllString(storageFormatHTML, "$1")
	text = tagPattern.ReplaceAllString(text, " ")
	text = strings.Join(strings.Fields(text), " ")
	if len(text) <= maxChars {
		return text
	}

	cut := maxChars
	for cut > 0 && cut < len(text) && !unicode.IsSpace(rune(text[cut])) {
		cut--
	}
	if cut <= 0 {
		cut = maxChars
	}
	return strings.TrimSpace(text[:cut])
}
