package nexadapter

import (
	"strings"
	"unicode"
)

type chunkSegment struct {
	kind  string // "text" | "fence"
	text  string
	open  string
	body  string
	close string
}

// ChunkText splits text into chunks that fit within the given character limit.
// It splits at natural boundaries to produce readable chunks:
//
//  1. Paragraph breaks (\n\n)
//  2. Line breaks (\n)
//  3. Sentence endings (. ! ?)
//  4. Word boundaries (spaces)
//  5. Hard cut at limit (last resort)
//
// Returns a single-element slice if the text fits within the limit.
// Returns nil for empty text.
//
// Additionally, it preserves fenced code blocks:
// - never splits inside a fenced block if avoidable
// - if a single fenced block exceeds the limit, it is split by closing and reopening the fence
func ChunkText(text string, limit int) []string {
	if text == "" {
		return nil
	}
	if limit <= 0 || len(text) <= limit {
		return []string{text}
	}

	var chunks []string
	current := ""

	pushCurrent := func() {
		out := strings.TrimRight(current, " ")
		if out != "" {
			chunks = append(chunks, out)
		}
		current = ""
	}

	appendText := func(segment string) {
		remaining := segment
		for len(remaining) > 0 {
			if current == "" {
				if len(remaining) <= limit {
					current = remaining
					return
				}
				splitAt := findSplitPoint(remaining, limit)
				piece := strings.TrimRight(remaining[:splitAt], " ")
				if piece != "" {
					current = piece
					pushCurrent()
				}
				remaining = strings.TrimLeft(remaining[splitAt:], " ")
				continue
			}

			available := limit - len(current)
			if available <= 0 {
				pushCurrent()
				continue
			}
			if len(remaining) <= available {
				current += remaining
				return
			}

			splitAt := findSplitPoint(remaining, available)
			piece := strings.TrimRight(remaining[:splitAt], " ")
			if piece != "" {
				current += piece
				pushCurrent()
			}
			remaining = strings.TrimLeft(remaining[splitAt:], " ")
		}
	}

	segments := splitByFencedCodeBlocks(text)

	splitFence := func(open, body, close string) []string {
		full := open + body + close
		if len(full) <= limit {
			return []string{full}
		}

		overhead := len(open) + len(close)
		maxBody := limit - overhead
		if maxBody <= 0 {
			return []string{full}
		}

		var parts []string
		lines := splitLinesPreserveNewline(body)
		var buf strings.Builder

		flush := func() {
			if buf.Len() == 0 {
				return
			}
			parts = append(parts, buf.String())
			buf.Reset()
		}

		for _, line := range lines {
			if len(line) > maxBody {
				flush()
				rem := line
				for len(rem) > 0 {
					n := maxBody
					if n > len(rem) {
						n = len(rem)
					}
					parts = append(parts, rem[:n])
					rem = rem[n:]
				}
				continue
			}

			if buf.Len() > 0 && buf.Len()+len(line) > maxBody {
				flush()
			}
			buf.WriteString(line)
		}
		flush()

		var out []string
		for _, p := range parts {
			if p == "" {
				continue
			}
			out = append(out, open+p+close)
		}
		return out
	}

	for _, seg := range segments {
		if seg.kind == "text" {
			appendText(seg.text)
			continue
		}

		fullLen := len(seg.open) + len(seg.body) + len(seg.close)
		if fullLen > limit {
			if current != "" {
				pushCurrent()
			}
			for _, c := range splitFence(seg.open, seg.body, seg.close) {
				out := strings.TrimRight(c, " ")
				if out != "" {
					chunks = append(chunks, out)
				}
			}
			continue
		}

		fenceText := seg.open + seg.body + seg.close
		if current == "" {
			current = fenceText
			continue
		}
		if len(current)+len(fenceText) <= limit {
			current += fenceText
			continue
		}
		pushCurrent()
		current = fenceText
	}

	if current != "" {
		pushCurrent()
	}

	return chunks
}

func splitLinesPreserveNewline(s string) []string {
	if s == "" {
		return nil
	}
	var lines []string
	start := 0
	for start < len(s) {
		idx := strings.IndexByte(s[start:], '\n')
		if idx == -1 {
			lines = append(lines, s[start:])
			break
		}
		end := start + idx + 1
		lines = append(lines, s[start:end])
		start = end
	}
	return lines
}

func splitByFencedCodeBlocks(text string) []chunkSegment {
	var segments []chunkSegment

	last := 0
	inFence := false
	fenceStart := 0
	openEnd := 0
	var fenceChar byte
	fenceLen := 0

	i := 0
	for i < len(text) {
		lineStart := i
		j := strings.IndexByte(text[i:], '\n')
		lineEnd := 0
		if j == -1 {
			lineEnd = len(text)
			i = len(text)
		} else {
			lineEnd = i + j + 1
			i = lineEnd
		}
		line := text[lineStart:lineEnd]
		lineNoNL := strings.TrimRight(line, "\n")
		trimmed := strings.TrimLeft(lineNoNL, " \t")

		if !inFence {
			if ch, n, ok := parseFenceDelimiter(trimmed); ok {
				if lineStart > last {
					segments = append(segments, chunkSegment{kind: "text", text: text[last:lineStart]})
				}
				inFence = true
				fenceChar = ch
				fenceLen = n
				fenceStart = lineStart
				openEnd = lineEnd
				continue
			}
			continue
		}

		// inside fence: look for closing delimiter
		if isFenceClose(trimmed, fenceChar, fenceLen) {
			openLine := text[fenceStart:openEnd]
			body := text[openEnd:lineStart]
			closeLine := text[lineStart:lineEnd]
			segments = append(segments, chunkSegment{
				kind:  "fence",
				open:  openLine,
				body:  body,
				close: closeLine,
			})
			inFence = false
			last = lineEnd
			continue
		}
	}

	if inFence {
		openLine := text[fenceStart:openEnd]
		body := text[openEnd:]
		closeLine := strings.Repeat(string(fenceChar), max(3, fenceLen)) + "\n"
		segments = append(segments, chunkSegment{kind: "fence", open: openLine, body: body, close: closeLine})
	} else if last < len(text) {
		segments = append(segments, chunkSegment{kind: "text", text: text[last:]})
	}
	return segments
}

func parseFenceDelimiter(trimmedLine string) (ch byte, n int, ok bool) {
	if strings.HasPrefix(trimmedLine, "```") {
		ch = '`'
	} else if strings.HasPrefix(trimmedLine, "~~~") {
		ch = '~'
	} else {
		return 0, 0, false
	}

	for n < len(trimmedLine) && trimmedLine[n] == ch {
		n++
	}
	if n < 3 {
		return 0, 0, false
	}
	return ch, n, true
}

func isFenceClose(trimmedLine string, fenceChar byte, fenceLen int) bool {
	if fenceLen < 3 {
		return false
	}
	if len(trimmedLine) < fenceLen {
		return false
	}
	for i := 0; i < fenceLen; i++ {
		if trimmedLine[i] != fenceChar {
			return false
		}
	}
	// Allow longer fences to close shorter openings (common markdown behavior).
	i := fenceLen
	for i < len(trimmedLine) && trimmedLine[i] == fenceChar {
		i++
	}
	return i >= fenceLen
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// findSplitPoint finds the best position to split text at, searching
// backwards from the limit for natural break points.
func findSplitPoint(text string, limit int) int {
	if limit >= len(text) {
		return len(text)
	}

	// 1. Look for paragraph break (\n\n) in the last 30% of the chunk
	searchStart := limit * 70 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window := text[searchStart:limit]
	if idx := strings.LastIndex(window, "\n\n"); idx != -1 {
		return searchStart + idx + 2 // Include the newlines in the first chunk
	}

	// 2. Look for line break (\n) in the last 40%
	searchStart = limit * 60 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window = text[searchStart:limit]
	if idx := strings.LastIndex(window, "\n"); idx != -1 {
		return searchStart + idx + 1
	}

	// 3. Look for sentence end (. ! ?) in the last 50%
	searchStart = limit * 50 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	for i := limit - 1; i >= searchStart; i-- {
		r := rune(text[i])
		if r == '.' || r == '!' || r == '?' {
			// Make sure next char is whitespace or end (actual sentence end, not "Mr.")
			if i+1 >= len(text) || unicode.IsSpace(rune(text[i+1])) {
				return i + 1
			}
		}
	}

	// 4. Look for word boundary (space) in the last 20%
	searchStart = limit * 80 / 100
	if searchStart < 0 {
		searchStart = 0
	}
	window = text[searchStart:limit]
	if idx := strings.LastIndex(window, " "); idx != -1 {
		return searchStart + idx + 1
	}

	// 5. Hard cut at limit (no good break point found)
	return limit
}

// SendWithChunking is a helper that wraps a platform-specific send function
// with automatic text chunking. It splits the text into chunks, calls sendFn
// for each chunk, and assembles the DeliveryResult.
//
// The sendFn receives a single chunk and returns the platform message ID.
// SendWithChunking collects all IDs and returns a unified result.
//
// Example:
//
//	result := nexadapter.SendWithChunking(req.Text, 2000, func(chunk string) (string, error) {
//	    return discordAPI.SendMessage(channelID, chunk)
//	})
func SendWithChunking(text string, charLimit int, sendFn func(chunk string) (messageID string, err error)) *DeliveryResult {
	totalChars := len(text)
	chunks := ChunkText(text, charLimit)
	if len(chunks) == 0 {
		return &DeliveryResult{
			Success:    false,
			MessageIDs: nil,
			ChunksSent: 0,
			TotalChars: totalChars,
			Error: &DeliveryError{
				Type:    "content_rejected",
				Message: "empty message",
				Retry:   false,
			},
		}
	}

	var messageIDs []string
	for i, chunk := range chunks {
		id, err := sendFn(chunk)
		if err != nil {
			return &DeliveryResult{
				Success:    false,
				MessageIDs: messageIDs,
				ChunksSent: i,
				TotalChars: totalChars,
				Error: &DeliveryError{
					Type:    "network",
					Message: err.Error(),
					Retry:   true,
				},
			}
		}
		messageIDs = append(messageIDs, id)
	}

	return &DeliveryResult{
		Success:    true,
		MessageIDs: messageIDs,
		ChunksSent: len(chunks),
		TotalChars: totalChars,
	}
}
