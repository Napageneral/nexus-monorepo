package delivery

import (
	"fmt"
	"html"
	"regexp"
	"strings"
)

var (
	linkPattern       = regexp.MustCompile(`\[(.*?)\]\((.*?)\)`)
	boldPattern       = regexp.MustCompile(`\*\*(.*?)\*\*`)
	italicPattern     = regexp.MustCompile(`\*(.*?)\*`)
	inlineCodePattern = regexp.MustCompile("`([^`]+)`")
)

func ExtractTitle(text string) (string, string) {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	if !strings.HasPrefix(normalized, "# ") {
		return "", text
	}

	lines := strings.Split(normalized, "\n")
	title := strings.TrimSpace(strings.TrimPrefix(lines[0], "# "))
	body := strings.TrimSpace(strings.Join(lines[1:], "\n"))
	return title, body
}

func MarkdownToStorageFormat(md string) string {
	md = strings.ReplaceAll(md, "\r\n", "\n")
	lines := strings.Split(md, "\n")

	var out []string
	for i := 0; i < len(lines); {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			i++
			continue
		}

		if strings.HasPrefix(line, "```") {
			var code []string
			i++
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```") {
				code = append(code, lines[i])
				i++
			}
			if i < len(lines) {
				i++
			}
			out = append(out, fmt.Sprintf(`<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[%s]]></ac:plain-text-body></ac:structured-macro>`, strings.Join(code, "\n")))
			continue
		}

		if headingLevel := headingLevel(line); headingLevel > 0 {
			content := strings.TrimSpace(line[headingLevel+1:])
			out = append(out, fmt.Sprintf("<h%d>%s</h%d>", headingLevel, inlineMarkdown(content), headingLevel))
			i++
			continue
		}

		if table, next := parseTable(lines, i); next > i {
			out = append(out, table)
			i = next
			continue
		}

		if strings.HasPrefix(line, "- ") {
			var items []string
			for i < len(lines) {
				item := strings.TrimSpace(lines[i])
				if !strings.HasPrefix(item, "- ") {
					break
				}
				items = append(items, "<li>"+inlineMarkdown(strings.TrimSpace(strings.TrimPrefix(item, "- ")))+"</li>")
				i++
			}
			out = append(out, "<ul>"+strings.Join(items, "")+"</ul>")
			continue
		}

		if orderedListItem(line) {
			var items []string
			for i < len(lines) {
				item := strings.TrimSpace(lines[i])
				if !orderedListItem(item) {
					break
				}
				parts := strings.SplitN(item, ". ", 2)
				items = append(items, "<li>"+inlineMarkdown(parts[1])+"</li>")
				i++
			}
			out = append(out, "<ol>"+strings.Join(items, "")+"</ol>")
			continue
		}

		if line == "---" || line == "***" {
			out = append(out, "<hr />")
			i++
			continue
		}

		var paragraph []string
		for i < len(lines) {
			current := strings.TrimSpace(lines[i])
			if current == "" || strings.HasPrefix(current, "```") || strings.HasPrefix(current, "- ") || orderedListItem(current) || headingLevel(current) > 0 {
				break
			}
			if _, next := parseTable(lines, i); next > i {
				break
			}
			paragraph = append(paragraph, current)
			i++
		}
		out = append(out, "<p>"+inlineMarkdown(strings.Join(paragraph, " "))+"</p>")
	}

	return strings.Join(out, "")
}

func inlineMarkdown(text string) string {
	escaped := html.EscapeString(text)
	escaped = linkPattern.ReplaceAllString(escaped, `<a href="$2">$1</a>`)
	escaped = boldPattern.ReplaceAllString(escaped, `<strong>$1</strong>`)
	escaped = italicPattern.ReplaceAllString(escaped, `<em>$1</em>`)
	escaped = inlineCodePattern.ReplaceAllString(escaped, `<code>$1</code>`)
	return escaped
}

func headingLevel(line string) int {
	for level := 1; level <= 6; level++ {
		prefix := strings.Repeat("#", level) + " "
		if strings.HasPrefix(line, prefix) {
			return level
		}
	}
	return 0
}

func orderedListItem(line string) bool {
	for i := 0; i < len(line); i++ {
		if line[i] == '.' && i+1 < len(line) && line[i+1] == ' ' && i > 0 {
			return true
		}
		if line[i] < '0' || line[i] > '9' {
			return false
		}
	}
	return false
}

func parseTable(lines []string, start int) (string, int) {
	if start+1 >= len(lines) {
		return "", start
	}
	header := strings.TrimSpace(lines[start])
	separator := strings.TrimSpace(lines[start+1])
	if !strings.Contains(header, "|") || !strings.Contains(separator, "---") {
		return "", start
	}

	headers := tableCells(header)
	rows := []string{"<tr>" + wrapCells(headers, "th") + "</tr>"}
	i := start + 2
	for i < len(lines) {
		row := strings.TrimSpace(lines[i])
		if row == "" || !strings.Contains(row, "|") {
			break
		}
		rows = append(rows, "<tr>"+wrapCells(tableCells(row), "td")+"</tr>")
		i++
	}
	return "<table>" + strings.Join(rows, "") + "</table>", i
}

func tableCells(line string) []string {
	trimmed := strings.Trim(line, "|")
	parts := strings.Split(trimmed, "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cells = append(cells, inlineMarkdown(strings.TrimSpace(part)))
	}
	return cells
}

func wrapCells(cells []string, tag string) string {
	var parts []string
	for _, cell := range cells {
		parts = append(parts, "<"+tag+">"+cell+"</"+tag+">")
	}
	return strings.Join(parts, "")
}
