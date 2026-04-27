import type { ChatLaneSummary } from "../types";

export type LaneGroup = {
  group_lane_id: string;
  header_title: string;
  header_subtitle: string | null;
  header_preview_text: string | null;
  header_updated_at: number;
  header_run_state: string;
  worker_lanes: Array<{
    lane_id: string;
    title: string;
    subtitle: string | null;
    preview_text: string | null;
    updated_at: number;
    run_state: string;
    is_direct_lane: boolean;
  }>;
};

export function formatRelativeTimeLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  const deltaMs = Date.now() - timestamp;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (deltaMs < minuteMs) return "now";
  if (deltaMs < hourMs) return `${Math.max(1, Math.round(deltaMs / minuteMs))}m`;
  if (deltaMs < dayMs) return `${Math.max(1, Math.round(deltaMs / hourMs))}h`;
  return `${Math.max(1, Math.round(deltaMs / dayMs))}d`;
}

export function buildLaneGroups(lanes: readonly ChatLaneSummary[]): LaneGroup[] {
  const childrenByParent = new Map<string, ChatLaneSummary[]>();
  const topLevel: ChatLaneSummary[] = [];
  for (const lane of lanes) {
    if (!lane.parent_lane_id) {
      topLevel.push(lane);
      continue;
    }
    const bucket = childrenByParent.get(lane.parent_lane_id) ?? [];
    bucket.push(lane);
    childrenByParent.set(lane.parent_lane_id, bucket);
  }

  return topLevel
    .map((lane) => {
      const children = [...(childrenByParent.get(lane.lane_id) ?? [])].sort(
        (left, right) => right.updated_at - left.updated_at,
      );
      return {
        group_lane_id: lane.lane_id,
        header_title: lane.title,
        header_subtitle: lane.subtitle,
        header_preview_text: lane.preview_text,
        header_updated_at: lane.updated_at,
        header_run_state: lane.run_state,
        worker_lanes: children.map((child) => ({
            lane_id: child.lane_id,
            title: child.title,
            subtitle: child.subtitle,
            preview_text: child.preview_text,
            updated_at: child.updated_at,
            run_state: child.run_state,
            is_direct_lane: false,
          })),
      };
    })
    .sort((left, right) => {
      return right.header_updated_at - left.header_updated_at;
    });
}

export function getVisibleLaneIds(
  groups: readonly LaneGroup[],
  expandedGroupIds: Readonly<Record<string, boolean>>,
): string[] {
  return groups.flatMap((group) => [
    group.group_lane_id,
    ...((expandedGroupIds[group.group_lane_id] ?? false)
      ? group.worker_lanes.map((lane) => lane.lane_id)
      : []),
  ]);
}

export function resolveAdjacentLaneId(input: {
  laneIds: readonly string[];
  currentLaneId: string | null;
  direction: "previous" | "next";
}): string | null {
  if (input.laneIds.length === 0) {
    return null;
  }
  if (!input.currentLaneId) {
    return input.direction === "previous"
      ? (input.laneIds.at(-1) ?? null)
      : (input.laneIds[0] ?? null);
  }
  const currentIndex = input.laneIds.indexOf(input.currentLaneId);
  if (currentIndex < 0) {
    return input.direction === "previous"
      ? (input.laneIds.at(-1) ?? null)
      : (input.laneIds[0] ?? null);
  }
  if (input.direction === "previous") {
    return input.laneIds[currentIndex - 1] ?? input.currentLaneId;
  }
  return input.laneIds[currentIndex + 1] ?? input.currentLaneId;
}
