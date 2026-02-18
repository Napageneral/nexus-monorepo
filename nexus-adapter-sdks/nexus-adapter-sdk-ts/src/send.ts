import { DeliveryResult } from "./protocol.js";

// chunkText mirrors the Go SDK chunking behavior:
// 1) paragraph breaks, 2) line breaks, 3) sentence ends, 4) word boundaries, 5) hard cut.
//
// Additionally, it preserves fenced code blocks:
// - never splits *inside* a fenced block if avoidable
// - if a single fenced block exceeds the limit, it is split by closing and reopening the fence
export function chunkText(text: string, limit: number): string[] {
  if (!text) {
    return [];
  }
  if (limit <= 0 || text.length <= limit) {
    return [text];
  }

  type Segment =
    | { kind: "text"; content: string }
    | { kind: "fence"; open: string; body: string; close: string };

  const segments: Segment[] = [];

  const lines = text.split("\n");
  let outside = "";
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let openLine = "";
  let body = "";

  const flushOutside = () => {
    if (outside) {
      segments.push({ kind: "text", content: outside });
      outside = "";
    }
  };

  const isFenceLine = (lineNoNL: string) => {
    const trimmed = lineNoNL.replace(/^[ \t]+/u, "");
    if (!trimmed.startsWith("```") && !trimmed.startsWith("~~~")) {
      return null;
    }
    const ch = trimmed[0]!;
    let n = 0;
    while (n < trimmed.length && trimmed[n] === ch) {
      n++;
    }
    if (n < 3) {
      return null;
    }
    return { ch, n };
  };

  const isFenceClose = (lineNoNL: string, ch: string, n: number) => {
    const trimmed = lineNoNL.replace(/^[ \t]+/u, "");
    if (!trimmed.startsWith(ch.repeat(Math.min(3, n)))) {
      return false;
    }
    let i = 0;
    while (i < trimmed.length && trimmed[i] === ch) {
      i++;
    }
    return i >= n;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNoNL = lines[i] ?? "";
    const fullLine = i < lines.length - 1 ? `${lineNoNL}\n` : lineNoNL;

    if (!inFence) {
      const fence = isFenceLine(lineNoNL);
      if (fence) {
        flushOutside();
        inFence = true;
        fenceChar = fence.ch;
        fenceLen = fence.n;
        openLine = fullLine;
        body = "";
        continue;
      }
      outside += fullLine;
      continue;
    }

    if (isFenceClose(lineNoNL, fenceChar, fenceLen)) {
      const closeLine = fullLine;
      segments.push({ kind: "fence", open: openLine, body, close: closeLine });
      inFence = false;
      fenceChar = "";
      fenceLen = 0;
      openLine = "";
      body = "";
      continue;
    }

    body += fullLine;
  }

  if (inFence) {
    // Unclosed fence: close it so chunking doesn't corrupt markdown for the rest of the message.
    const closeLine = `${fenceChar.repeat(Math.max(3, fenceLen))}\n`;
    segments.push({ kind: "fence", open: openLine, body, close: closeLine });
  } else {
    flushOutside();
  }

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const out = current.replace(/[ ]+$/u, "");
    if (out) {
      chunks.push(out);
    }
    current = "";
  };

  const appendText = (segment: string) => {
    let remaining = segment;
    while (remaining.length > 0) {
      if (!current) {
        if (remaining.length <= limit) {
          current = remaining;
          return;
        }
        const splitAt = findSplitPoint(remaining, limit);
        const piece = remaining.slice(0, splitAt).replace(/[ ]+$/u, "");
        if (piece) {
          current = piece;
          pushCurrent();
        }
        remaining = remaining.slice(splitAt).replace(/^[ ]+/u, "");
        continue;
      }

      const available = limit - current.length;
      if (available <= 0) {
        pushCurrent();
        continue;
      }
      if (remaining.length <= available) {
        current += remaining;
        return;
      }

      const splitAt = findSplitPoint(remaining, available);
      const piece = remaining.slice(0, splitAt).replace(/[ ]+$/u, "");
      if (piece) {
        current += piece;
        pushCurrent();
      }
      remaining = remaining.slice(splitAt).replace(/^[ ]+/u, "");
    }
  };

  const splitFence = (open: string, bodyText: string, close: string): string[] => {
    const full = `${open}${bodyText}${close}`;
    if (full.length <= limit) {
      return [full];
    }

    const overhead = open.length + close.length;
    const maxBody = limit - overhead;
    if (maxBody <= 0) {
      return [full];
    }

    const parts: string[] = [];
    const bodyLines = bodyText.split("\n");
    let buf = "";
    const flush = () => {
      if (!buf) {
        return;
      }
      parts.push(buf);
      buf = "";
    };

    for (let i = 0; i < bodyLines.length; i++) {
      const lineNoNL = bodyLines[i] ?? "";
      const line = i < bodyLines.length - 1 ? `${lineNoNL}\n` : lineNoNL;

      if (line.length > maxBody) {
        flush();
        let remaining = line;
        while (remaining.length > 0) {
          const take = Math.min(maxBody, remaining.length);
          parts.push(remaining.slice(0, take));
          remaining = remaining.slice(take);
        }
        continue;
      }

      if (buf.length + line.length > maxBody && buf) {
        flush();
      }
      buf += line;
    }
    flush();

    return parts.filter(Boolean).map((p) => `${open}${p}${close}`);
  };

  for (const seg of segments) {
    if (seg.kind === "text") {
      appendText(seg.content);
      continue;
    }

    const fullLen = seg.open.length + seg.body.length + seg.close.length;
    if (fullLen > limit) {
      // Large fences get emitted as their own standalone chunks.
      if (current) {
        pushCurrent();
      }
      const fenceChunks = splitFence(seg.open, seg.body, seg.close);
      for (const c of fenceChunks) {
        const out = c.replace(/[ ]+$/u, "");
        if (out) {
          chunks.push(out);
        }
      }
      continue;
    }

    const fenceText = `${seg.open}${seg.body}${seg.close}`;
    if (!current) {
      current = fenceText;
      continue;
    }
    if (current.length + fenceText.length <= limit) {
      current += fenceText;
      continue;
    }
    pushCurrent();
    current = fenceText;
  }

  if (current) {
    pushCurrent();
  }

  return chunks;
}

function findSplitPoint(text: string, limit: number): number {
  if (limit >= text.length) {
    return text.length;
  }

  // 1) Paragraph break in last 30%.
  let searchStart = Math.floor((limit * 70) / 100);
  if (searchStart < 0) {
    searchStart = 0;
  }
  let window = text.slice(searchStart, limit);
  let idx = window.lastIndexOf("\n\n");
  if (idx !== -1) {
    return searchStart + idx + 2;
  }

  // 2) Line break in last 40%.
  searchStart = Math.floor((limit * 60) / 100);
  if (searchStart < 0) {
    searchStart = 0;
  }
  window = text.slice(searchStart, limit);
  idx = window.lastIndexOf("\n");
  if (idx !== -1) {
    return searchStart + idx + 1;
  }

  // 3) Sentence end in last 50%.
  searchStart = Math.floor((limit * 50) / 100);
  if (searchStart < 0) {
    searchStart = 0;
  }
  for (let i = limit - 1; i >= searchStart; i--) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      if (next === undefined || /\s/u.test(next)) {
        return i + 1;
      }
    }
  }

  // 4) Word boundary in last 20%.
  searchStart = Math.floor((limit * 80) / 100);
  if (searchStart < 0) {
    searchStart = 0;
  }
  window = text.slice(searchStart, limit);
  idx = window.lastIndexOf(" ");
  if (idx !== -1) {
    return searchStart + idx + 1;
  }

  // 5) Hard cut.
  return limit;
}

export function sendWithChunking(
  text: string,
  charLimit: number,
  sendFn: (chunk: string) => Promise<string> | string,
): Promise<DeliveryResult> {
  const totalChars = text ? text.length : 0;
  const chunks = chunkText(text, charLimit);
  if (chunks.length === 0) {
    return Promise.resolve({
      success: false,
      message_ids: [],
      chunks_sent: 0,
      total_chars: totalChars,
      error: {
        type: "content_rejected",
        message: "empty message",
        retry: false,
      },
    });
  }

  const messageIds: string[] = [];
  return (async () => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      try {
        const id = await sendFn(chunk);
        messageIds.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message_ids: messageIds,
          chunks_sent: i,
          total_chars: totalChars,
          error: {
            type: "network",
            message: msg,
            retry: true,
          },
        };
      }
    }

    return {
      success: true,
      message_ids: messageIds,
      chunks_sent: chunks.length,
      total_chars: totalChars,
    };
  })();
}
