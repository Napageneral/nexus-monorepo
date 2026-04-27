import {
  BotIcon,
  Clock3Icon,
  HammerIcon,
  Link2Icon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { deriveLaneTimelineEntries, type LaneTimelineEntry } from "../ChatView.logic";
import { ChatMarkdown } from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { ChatLaneDetail } from "../../types";

const TIMELINE_CHUNK_SIZE = 80;

function entryIcon(entry: LaneTimelineEntry) {
  if (entry.entry_type === "message") {
    return entry.message.role === "user" ? UserIcon : BotIcon;
  }
  if (entry.activity.activity_type === "approval_request" || entry.activity.activity_type === "approval_resolution") {
    return ShieldCheckIcon;
  }
  if (entry.activity.activity_type === "web_activity") {
    return Link2Icon;
  }
  return HammerIcon;
}

function entryTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export const MessagesTimeline = memo(function MessagesTimeline(props: {
  laneDetail: ChatLaneDetail | null;
}) {
  const entries = deriveLaneTimelineEntries(props.laneDetail);
  const laneId = props.laneDetail?.lane.lane_id ?? null;
  const [visibleCount, setVisibleCount] = useState(TIMELINE_CHUNK_SIZE);

  useEffect(() => {
    setVisibleCount(TIMELINE_CHUNK_SIZE);
  }, [laneId]);

  const hiddenCount = Math.max(entries.length - visibleCount, 0);
  const visibleEntries = useMemo(
    () => (hiddenCount > 0 ? entries.slice(-visibleCount) : entries),
    [entries, hiddenCount, visibleCount],
  );

  if (entries.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-16 text-center">
        <div className="max-w-sm">
          <p className="text-sm text-muted-foreground">
            This lane has no transcript yet. Send a message to start the session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" data-testid="chat-transcript-panel">
      {hiddenCount > 0 ? (
        <div className="sticky top-0 z-10 flex justify-center px-2 pt-1">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
            <span className="text-muted-foreground text-xs">
              Showing the most recent {visibleEntries.length} of {entries.length} timeline items.
            </span>
            <Button
              onClick={() =>
                setVisibleCount((current) => Math.min(entries.length, current + TIMELINE_CHUNK_SIZE))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Show older
            </Button>
            <Button
              onClick={() => setVisibleCount(entries.length)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Show all
            </Button>
          </div>
        </div>
      ) : null}
      {visibleEntries.map((entry) => {
        const Icon = entryIcon(entry);
        if (entry.entry_type === "message") {
          const isUser = entry.message.role === "user";
          return (
            <article
              key={entry.id}
              className={`[contain-intrinsic-size:0_220px] [content-visibility:auto] flex w-full ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`flex max-w-[min(100%,52rem)] gap-3 ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div
                  className={`min-w-0 rounded-2xl border px-4 py-3 shadow-sm ${
                    isUser
                      ? "border-primary/20 bg-primary/[0.06]"
                      : "border-border/70 bg-card"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{isUser ? "Operator" : "Agent"}</span>
                    <span className="opacity-60">{entryTimestamp(entry.created_at)}</span>
                  </div>
                  <ChatMarkdown text={entry.message.text} />
                </div>
              </div>
            </article>
          );
        }

        return (
          <article
            key={entry.id}
            className="[contain-intrinsic-size:0_120px] [content-visibility:auto] flex justify-center"
          >
            <div className="flex w-full max-w-3xl items-start gap-3 rounded-2xl border border-border/65 bg-muted/20 px-4 py-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{entry.activity.title}</p>
                  {entry.activity.status ? (
                    <Badge size="sm" variant="outline">
                      {entry.activity.status}
                    </Badge>
                  ) : null}
                </div>
                {entry.activity.detail ? (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.activity.detail}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock3Icon className="size-3" />
                <span>{entryTimestamp(entry.created_at)}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
});
