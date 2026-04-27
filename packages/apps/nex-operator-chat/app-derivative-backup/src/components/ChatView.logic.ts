import type { ChatActivity, ChatLaneDetail, ChatLaneSummary, ChatMessage } from "../types";

export type LaneTimelineEntry =
  | {
      id: string;
      entry_type: "message";
      created_at: number;
      message: ChatMessage;
    }
  | {
      id: string;
      entry_type: "activity";
      created_at: number;
      activity: ChatActivity;
    };

export function resolveTopLevelLane(
  lane: ChatLaneSummary | null,
  lanesById: Record<string, ChatLaneSummary>,
): ChatLaneSummary | null {
  if (!lane) {
    return null;
  }
  let current = lane;
  while (current.parent_lane_id && lanesById[current.parent_lane_id]) {
    current = lanesById[current.parent_lane_id]!;
  }
  return current;
}

export function deriveLaneTimelineEntries(laneDetail: ChatLaneDetail | null): LaneTimelineEntry[] {
  if (!laneDetail) {
    return [];
  }
  return [
    ...laneDetail.messages.map((message) => ({
      id: `message:${message.id}`,
      entry_type: "message" as const,
      created_at: message.created_at,
      message,
    })),
    ...laneDetail.activities.map((activity) => ({
      id: `activity:${activity.id}`,
      entry_type: "activity" as const,
      created_at: activity.created_at,
      activity,
    })),
  ].sort((left, right) => left.created_at - right.created_at);
}
