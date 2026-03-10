package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type adfNode struct {
	Type    string         `json:"type"`
	Text    string         `json:"text,omitempty"`
	Attrs   map[string]any `json:"attrs,omitempty"`
	Marks   []adfMark      `json:"marks,omitempty"`
	Content []adfNode      `json:"content,omitempty"`
}

type adfMark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

func adfToMarkdown(raw json.RawMessage) (string, error) {
	if len(bytes.TrimSpace(raw)) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return "", nil
	}

	var root adfNode
	if err := json.Unmarshal(raw, &root); err != nil {
		return "", fmt.Errorf("parse ADF: %w", err)
	}
	if root.Type == "" {
		return "", nil
	}

	rendered := strings.TrimSpace(renderBlockNodes(root.Content, 0))
	return rendered, nil
}

func renderBlockNodes(nodes []adfNode, depth int) string {
	var parts []string
	for _, node := range nodes {
		rendered := strings.TrimSpace(renderBlockNode(node, depth))
		if rendered != "" {
			parts = append(parts, rendered)
		}
	}
	return strings.Join(parts, "\n\n")
}

func renderBlockNode(node adfNode, depth int) string {
	switch node.Type {
	case "paragraph":
		return strings.TrimSpace(renderInlineNodes(node.Content))
	case "heading":
		level := intAttr(node.Attrs, "level", 1)
		if level < 1 {
			level = 1
		}
		if level > 6 {
			level = 6
		}
		return strings.Repeat("#", level) + " " + strings.TrimSpace(renderInlineNodes(node.Content))
	case "blockquote":
		content := renderBlockNodes(node.Content, depth+1)
		if content == "" {
			return ""
		}
		lines := strings.Split(content, "\n")
		for i, line := range lines {
			if strings.TrimSpace(line) == "" {
				lines[i] = ">"
			} else {
				lines[i] = "> " + line
			}
		}
		return strings.Join(lines, "\n")
	case "bulletList":
		return renderList(node.Content, depth, false, intAttr(node.Attrs, "order", 1))
	case "orderedList":
		return renderList(node.Content, depth, true, intAttr(node.Attrs, "order", 1))
	case "codeBlock":
		language := stringAttr(node.Attrs, "language")
		content := strings.TrimRight(renderInlineNodes(node.Content), "\n")
		if language != "" {
			return fmt.Sprintf("```%s\n%s\n```", language, content)
		}
		return fmt.Sprintf("```\n%s\n```", content)
	case "table":
		return renderTable(node)
	case "mediaSingle", "mediaGroup":
		return renderMediaPlaceholder(node)
	case "rule":
		return "---"
	default:
		if len(node.Content) > 0 {
			return renderBlockNodes(node.Content, depth)
		}
		return strings.TrimSpace(renderInlineNode(node))
	}
}

func renderList(items []adfNode, depth int, ordered bool, start int) string {
	var lines []string
	index := start
	for _, item := range items {
		if item.Type != "listItem" {
			continue
		}
		prefix := "- "
		if ordered {
			prefix = fmt.Sprintf("%d. ", index)
			index++
		}
		itemBlocks := renderListItem(item, depth+1)
		if len(itemBlocks) == 0 {
			continue
		}
		indent := strings.Repeat("  ", depth)
		lines = append(lines, indent+prefix+itemBlocks[0])
		for _, block := range itemBlocks[1:] {
			if strings.TrimSpace(block) == "" {
				continue
			}
			blockLines := strings.Split(block, "\n")
			for _, line := range blockLines {
				lines = append(lines, indent+"  "+line)
			}
		}
	}
	return strings.Join(lines, "\n")
}

func renderListItem(item adfNode, depth int) []string {
	var blocks []string
	for _, child := range item.Content {
		rendered := renderBlockNode(child, depth)
		if strings.TrimSpace(rendered) != "" {
			blocks = append(blocks, rendered)
		}
	}
	return blocks
}

func renderTable(table adfNode) string {
	var rows [][]string
	for _, row := range table.Content {
		if row.Type != "tableRow" {
			continue
		}
		var cols []string
		for _, cell := range row.Content {
			cols = append(cols, strings.TrimSpace(renderInlineNodes(cell.Content)))
		}
		rows = append(rows, cols)
	}
	if len(rows) == 0 {
		return ""
	}

	header := rows[0]
	var lines []string
	lines = append(lines, "| "+strings.Join(header, " | ")+" |")
	separators := make([]string, len(header))
	for i := range separators {
		separators[i] = "---"
	}
	lines = append(lines, "| "+strings.Join(separators, " | ")+" |")
	for _, row := range rows[1:] {
		for len(row) < len(header) {
			row = append(row, "")
		}
		lines = append(lines, "| "+strings.Join(row[:len(header)], " | ")+" |")
	}
	return strings.Join(lines, "\n")
}

func renderMediaPlaceholder(node adfNode) string {
	for _, child := range node.Content {
		if child.Type == "media" {
			name := stringAttr(child.Attrs, "alt")
			if name == "" {
				name = stringAttr(child.Attrs, "id")
			}
			if name == "" {
				name = "attachment"
			}
			return fmt.Sprintf("[attachment: %s]", name)
		}
	}
	return "[attachment: attachment]"
}

func renderInlineNodes(nodes []adfNode) string {
	var b strings.Builder
	for _, node := range nodes {
		b.WriteString(renderInlineNode(node))
	}
	return b.String()
}

func renderInlineNode(node adfNode) string {
	switch node.Type {
	case "text":
		return applyMarks(node.Text, node.Marks)
	case "mention":
		name := stringAttr(node.Attrs, "text")
		if name == "" {
			name = stringAttr(node.Attrs, "displayName")
		}
		if name == "" {
			name = stringAttr(node.Attrs, "id")
		}
		if name == "" {
			name = "mention"
		}
		return "@" + strings.TrimPrefix(name, "@")
	case "hardBreak":
		return "\n"
	case "emoji":
		return stringAttr(node.Attrs, "text")
	case "inlineCard":
		if url := stringAttr(node.Attrs, "url"); url != "" {
			return "[" + url + "](" + url + ")"
		}
		return ""
	case "media":
		name := stringAttr(node.Attrs, "alt")
		if name == "" {
			name = stringAttr(node.Attrs, "id")
		}
		if name == "" {
			name = "attachment"
		}
		return fmt.Sprintf("[attachment: %s]", name)
	default:
		if len(node.Content) > 0 {
			return applyMarks(renderInlineNodes(node.Content), node.Marks)
		}
		return ""
	}
}

func applyMarks(text string, marks []adfMark) string {
	if text == "" {
		return ""
	}

	link := ""
	hasStrong := false
	hasEm := false
	hasCode := false
	hasStrike := false
	for _, mark := range marks {
		switch mark.Type {
		case "link":
			link = stringAttr(mark.Attrs, "href")
		case "strong":
			hasStrong = true
		case "em":
			hasEm = true
		case "code":
			hasCode = true
		case "strike":
			hasStrike = true
		}
	}

	if hasCode {
		text = "`" + text + "`"
	}
	if hasStrong && hasEm {
		text = "***" + text + "***"
	} else {
		if hasStrong {
			text = "**" + text + "**"
		}
		if hasEm {
			text = "*" + text + "*"
		}
	}
	if hasStrike {
		text = "~~" + text + "~~"
	}
	if link != "" {
		text = "[" + text + "](" + link + ")"
	}
	return text
}

func markdownToADF(md string) (json.RawMessage, error) {
	content := parseMarkdownBlocks(strings.ReplaceAll(md, "\r\n", "\n"))

	raw, err := json.Marshal(map[string]any{
		"type":    "doc",
		"version": 1,
		"content": content,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal markdown to ADF: %w", err)
	}
	return raw, nil
}

func parseMarkdownBlocks(md string) []map[string]any {
	lines := strings.Split(md, "\n")
	var blocks []map[string]any
	for i := 0; i < len(lines); {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			i++
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			language := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
			i++
			var body []string
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```") {
				body = append(body, lines[i])
				i++
			}
			if i < len(lines) {
				i++
			}
			block := map[string]any{
				"type": "codeBlock",
				"content": []map[string]any{
					{"type": "text", "text": strings.Join(body, "\n")},
				},
			}
			if language != "" {
				block["attrs"] = map[string]any{"language": language}
			}
			blocks = append(blocks, block)
			continue
		}

		if matches := headingPattern.FindStringSubmatch(trimmed); matches != nil {
			level := len(matches[1])
			blocks = append(blocks, map[string]any{
				"type":    "heading",
				"attrs":   map[string]any{"level": level},
				"content": parseMarkdownInlines(matches[2]),
			})
			i++
			continue
		}

		if strings.HasPrefix(trimmed, ">") {
			var quoteLines []string
			for i < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i]), ">") {
				quoteLines = append(quoteLines, strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[i]), ">")))
				i++
			}
			blocks = append(blocks, map[string]any{
				"type":    "blockquote",
				"content": parseMarkdownBlocks(strings.Join(quoteLines, "\n")),
			})
			continue
		}

		if list, next := parseMarkdownList(lines, i); list != nil {
			blocks = append(blocks, list)
			i = next
			continue
		}

		var paragraph []string
		for i < len(lines) {
			trimmedLine := strings.TrimSpace(lines[i])
			if trimmedLine == "" || strings.HasPrefix(trimmedLine, "```") || headingPattern.MatchString(trimmedLine) || strings.HasPrefix(trimmedLine, ">") || bulletPattern.MatchString(trimmedLine) || orderedPattern.MatchString(trimmedLine) {
				break
			}
			paragraph = append(paragraph, trimmedLine)
			i++
		}
		blocks = append(blocks, map[string]any{
			"type":    "paragraph",
			"content": parseMarkdownInlines(strings.Join(paragraph, " ")),
		})
	}
	return blocks
}

var (
	headingPattern = regexp.MustCompile(`^(#{1,6})\s+(.*)$`)
	bulletPattern  = regexp.MustCompile(`^[-*]\s+(.*)$`)
	orderedPattern = regexp.MustCompile(`^\d+\.\s+(.*)$`)
	linkPattern    = regexp.MustCompile(`^\[([^\]]+)\]\(([^)]+)\)`)
)

func parseMarkdownList(lines []string, start int) (map[string]any, int) {
	if start >= len(lines) {
		return nil, start
	}
	trimmed := strings.TrimSpace(lines[start])
	listType := ""
	if bulletPattern.MatchString(trimmed) {
		listType = "bulletList"
	}
	if orderedPattern.MatchString(trimmed) {
		listType = "orderedList"
	}
	if listType == "" {
		return nil, start
	}

	var items []map[string]any
	i := start
	order := 1
	for i < len(lines) {
		trimmed = strings.TrimSpace(lines[i])
		var text string
		if listType == "bulletList" {
			matches := bulletPattern.FindStringSubmatch(trimmed)
			if matches == nil {
				break
			}
			text = matches[1]
		} else {
			matches := orderedPattern.FindStringSubmatch(trimmed)
			if matches == nil {
				break
			}
			text = matches[1]
		}
		items = append(items, map[string]any{
			"type": "listItem",
			"content": []map[string]any{
				{
					"type":    "paragraph",
					"content": parseMarkdownInlines(text),
				},
			},
		})
		i++
	}
	list := map[string]any{
		"type":    listType,
		"content": items,
	}
	if listType == "orderedList" {
		list["attrs"] = map[string]any{"order": order}
	}
	return list, i
}

func parseMarkdownInlines(text string) []map[string]any {
	var nodes []map[string]any
	for len(text) > 0 {
		switch {
		case strings.HasPrefix(text, "**"):
			if idx := strings.Index(text[2:], "**"); idx >= 0 {
				nodes = append(nodes, addMark(parseMarkdownInlines(text[2:2+idx]), map[string]any{"type": "strong"})...)
				text = text[2+idx+2:]
				continue
			}
		case strings.HasPrefix(text, "~~"):
			if idx := strings.Index(text[2:], "~~"); idx >= 0 {
				nodes = append(nodes, addMark(parseMarkdownInlines(text[2:2+idx]), map[string]any{"type": "strike"})...)
				text = text[2+idx+2:]
				continue
			}
		case strings.HasPrefix(text, "`"):
			if idx := strings.Index(text[1:], "`"); idx >= 0 {
				nodes = append(nodes, map[string]any{
					"type":  "text",
					"text":  text[1 : 1+idx],
					"marks": []map[string]any{{"type": "code"}},
				})
				text = text[1+idx+1:]
				continue
			}
		case strings.HasPrefix(text, "*"):
			if idx := strings.Index(text[1:], "*"); idx >= 0 {
				nodes = append(nodes, addMark(parseMarkdownInlines(text[1:1+idx]), map[string]any{"type": "em"})...)
				text = text[1+idx+1:]
				continue
			}
		case strings.HasPrefix(text, "["):
			if match := linkPattern.FindStringSubmatch(text); match != nil {
				nodes = append(nodes, addMark(parseMarkdownInlines(match[1]), map[string]any{"type": "link", "attrs": map[string]any{"href": match[2]}})...)
				text = text[len(match[0]):]
				continue
			}
		}

		next := len(text)
		for _, marker := range []string{"**", "~~", "`", "*", "["} {
			if idx := strings.Index(text[1:], marker); idx >= 0 && idx+1 < next {
				next = idx + 1
			}
		}
		chunk := text[:next]
		nodes = append(nodes, map[string]any{"type": "text", "text": chunk})
		text = text[next:]
	}
	return mergeAdjacentTextNodes(nodes)
}

func addMark(nodes []map[string]any, mark map[string]any) []map[string]any {
	for _, node := range nodes {
		if node["type"] == "text" {
			marks, _ := node["marks"].([]map[string]any)
			node["marks"] = append(marks, mark)
			continue
		}
		if content, ok := node["content"].([]map[string]any); ok {
			node["content"] = addMark(content, mark)
		}
	}
	return nodes
}

func mergeAdjacentTextNodes(nodes []map[string]any) []map[string]any {
	var merged []map[string]any
	for _, node := range nodes {
		if len(merged) == 0 {
			merged = append(merged, node)
			continue
		}
		last := merged[len(merged)-1]
		if canMergeTextNodes(last, node) {
			last["text"] = last["text"].(string) + node["text"].(string)
			continue
		}
		merged = append(merged, node)
	}
	return merged
}

func canMergeTextNodes(a, b map[string]any) bool {
	if a["type"] != "text" || b["type"] != "text" {
		return false
	}
	aMarks, _ := json.Marshal(a["marks"])
	bMarks, _ := json.Marshal(b["marks"])
	return string(aMarks) == string(bMarks)
}

func stringAttr(attrs map[string]any, key string) string {
	if attrs == nil {
		return ""
	}
	if value, ok := attrs[key]; ok && value != nil {
		return strings.TrimSpace(fmt.Sprintf("%v", value))
	}
	return ""
}

func intAttr(attrs map[string]any, key string, fallback int) int {
	if attrs == nil {
		return fallback
	}
	value, ok := attrs[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	case string:
		parsed, err := strconv.Atoi(typed)
		if err == nil {
			return parsed
		}
	}
	return fallback
}
