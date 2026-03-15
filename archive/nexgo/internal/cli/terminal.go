package cli

import (
	"fmt"
	"strings"
	"time"
)

// ANSI escape codes for terminal formatting.
const (
	ansiReset  = "\033[0m"
	ansiBold   = "\033[1m"
	ansiRed    = "\033[31m"
	ansiGreen  = "\033[32m"
	ansiYellow = "\033[33m"
	ansiCyan   = "\033[36m"
)

// Bold wraps a string in ANSI bold formatting.
func Bold(s string) string {
	return ansiBold + s + ansiReset
}

// Green wraps a string in ANSI green color.
func Green(s string) string {
	return ansiGreen + s + ansiReset
}

// Red wraps a string in ANSI red color.
func Red(s string) string {
	return ansiRed + s + ansiReset
}

// Yellow wraps a string in ANSI yellow color.
func Yellow(s string) string {
	return ansiYellow + s + ansiReset
}

// Cyan wraps a string in ANSI cyan color.
func Cyan(s string) string {
	return ansiCyan + s + ansiReset
}

// StatusIcon returns a check mark or cross depending on status.
func StatusIcon(ok bool) string {
	if ok {
		return Green("✓")
	}
	return Red("✗")
}

// FormatDuration formats a duration into a human-readable string.
func FormatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	if d < time.Hour {
		mins := int(d.Minutes())
		secs := int(d.Seconds()) % 60
		return fmt.Sprintf("%dm%ds", mins, secs)
	}
	hours := int(d.Hours())
	mins := int(d.Minutes()) % 60
	return fmt.Sprintf("%dh%dm", hours, mins)
}

// FormatBytes formats a byte count into a human-readable string.
func FormatBytes(b int64) string {
	const (
		kb = 1024
		mb = kb * 1024
		gb = mb * 1024
		tb = gb * 1024
	)

	switch {
	case b >= tb:
		return fmt.Sprintf("%.1f TB", float64(b)/float64(tb))
	case b >= gb:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(gb))
	case b >= mb:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(mb))
	case b >= kb:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(kb))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

// RenderTable renders a simple ASCII table with headers and rows.
func RenderTable(headers []string, rows [][]string) string {
	if len(headers) == 0 {
		return ""
	}

	// Calculate column widths.
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}

	var b strings.Builder

	// Header row.
	for i, h := range headers {
		if i > 0 {
			b.WriteString("  ")
		}
		b.WriteString(fmt.Sprintf("%-*s", widths[i], h))
	}
	b.WriteString("\n")

	// Separator.
	for i, w := range widths {
		if i > 0 {
			b.WriteString("  ")
		}
		b.WriteString(strings.Repeat("-", w))
	}
	b.WriteString("\n")

	// Data rows.
	for _, row := range rows {
		for i := 0; i < len(headers); i++ {
			if i > 0 {
				b.WriteString("  ")
			}
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			b.WriteString(fmt.Sprintf("%-*s", widths[i], cell))
		}
		b.WriteString("\n")
	}

	return b.String()
}
