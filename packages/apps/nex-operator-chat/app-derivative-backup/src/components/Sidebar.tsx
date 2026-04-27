import {
  BotIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useNexChatActions, useNexChatState } from "../chat-runtime";
import { Badge } from "./ui/badge";
import { Collapsible, CollapsibleContent } from "./ui/collapsible";
import {
  buildLaneGroups,
  formatRelativeTimeLabel,
  getVisibleLaneIds,
  resolveAdjacentLaneId,
} from "./Sidebar.logic";
import {
  SidebarMenuAction,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "./ui/sidebar";

function statusVariant(status: string) {
  if (status === "error") return "error";
  if (status === "recovering" || status === "loading") return "warning";
  if (status === "ready") return "success";
  return "outline";
}

function laneStateVariant(runState: string) {
  if (runState === "error") return "error";
  if (runState === "waiting_approval") return "warning";
  if (runState === "running" || runState === "queued") return "info";
  return "outline";
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  const routeLaneId =
    typeof search.lane === "string" && search.lane.trim().length > 0 ? search.lane.trim() : null;
  const actions = useNexChatActions();
  const { status, lanes, selectedLaneId } = useNexChatState();
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => buildLaneGroups(lanes), [lanes]);
  const visibleLaneIds = useMemo(
    () => getVisibleLaneIds(groups, expandedGroupIds),
    [expandedGroupIds, groups],
  );

  useEffect(() => {
    setExpandedGroupIds((current) => {
      const next = { ...current };
      for (const group of groups) {
        if (!(group.group_lane_id in next)) {
          next[group.group_lane_id] = false;
        }
      }
      const currentLaneId = routeLaneId ?? selectedLaneId;
      if (!currentLaneId) {
        return next;
      }
      for (const group of groups) {
        if (group.worker_lanes.some((lane) => lane.lane_id === currentLaneId)) {
          next[group.group_lane_id] = true;
        }
      }
      return next;
    });
  }, [groups, routeLaneId, selectedLaneId]);

  const activeLaneId = routeLaneId ?? selectedLaneId;

  const navigateToLane = (laneId: string) => {
    actions.selectLane(laneId);
    void actions.loadLane(laneId);
    void navigate({
      to: "/",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        lane: laneId,
      }),
    });
  };

  const handleKeyboardNavigation = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const nextLaneId = resolveAdjacentLaneId({
      laneIds: visibleLaneIds,
      currentLaneId: activeLaneId,
      direction: event.key === "ArrowUp" ? "previous" : "next",
    });
    if (!nextLaneId) {
      return;
    }
    event.preventDefault();
    navigateToLane(nextLaneId);
  };

  return (
    <>
      <SidebarHeader className="gap-2 px-3 py-3" data-testid="chat-sidebar">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-medium text-sm">Agents</h1>
            <p className="truncate text-muted-foreground text-xs">
              Direct manager lanes stay visible. Worker lanes stay tucked away until expanded.
            </p>
          </div>
          <Badge data-testid="chat-sidebar-status" size="sm" variant={statusVariant(status)}>
            {status}
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent
        className="gap-0 px-2 pb-2"
        data-testid="chat-sidebar-lanes"
        onKeyDown={handleKeyboardNavigation}
      >
        <SidebarGroup className="gap-1">
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groups.map((group) => {
                const expanded = expandedGroupIds[group.group_lane_id] ?? false;
                const hasWorkers = group.worker_lanes.length > 0;
                const managerActive = activeLaneId === group.group_lane_id;
                const workerActive = group.worker_lanes.some((lane) => lane.lane_id === activeLaneId);
                const showWorkers = hasWorkers && (expanded || workerActive);
                return (
                  <SidebarMenuItem key={group.group_lane_id} className="group/agent">
                    <Collapsible
                      onOpenChange={(open) => {
                        if (!hasWorkers) {
                          return;
                        }
                        setExpandedGroupIds((current) => ({
                          ...current,
                          [group.group_lane_id]: open,
                        }));
                      }}
                      open={showWorkers}
                    >
                      <SidebarMenuButton
                        className="h-auto min-h-12 w-full items-start gap-3 pr-10 py-2.5"
                        data-lane-id={group.group_lane_id}
                        data-testid="chat-lane-button"
                        isActive={managerActive}
                        onClick={() => navigateToLane(group.group_lane_id)}
                      >
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
                          <BotIcon className="size-4" />
                        </div>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden text-left">
                          <span className="truncate text-sm">{group.header_title}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {group.header_preview_text ??
                              group.header_subtitle ??
                              (hasWorkers
                                ? `${group.worker_lanes.length} worker lanes tucked under this agent`
                                : "Direct manager lane")}
                          </span>
                        </span>
                        <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground/70">
                          {formatRelativeTimeLabel(group.header_updated_at)}
                        </span>
                      </SidebarMenuButton>
                      {hasWorkers ? (
                        <SidebarMenuAction
                          aria-label={`${showWorkers ? "Collapse" : "Expand"} ${group.header_title} workers`}
                          className={`${showWorkers ? "opacity-100 text-foreground" : "text-muted-foreground"}`}
                          data-group-lane-id={group.group_lane_id}
                          data-testid="chat-group-toggle"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setExpandedGroupIds((current) => ({
                              ...current,
                              [group.group_lane_id]: !showWorkers,
                            }));
                          }}
                          showOnHover
                          type="button"
                        >
                          <ChevronRightIcon
                            className={`size-3.5 transition-transform ${showWorkers ? "rotate-90" : ""}`}
                          />
                        </SidebarMenuAction>
                      ) : null}
                      <CollapsibleContent>
                        <SidebarMenuSub className="mx-2 mt-1 border-l-0 px-0">
                          {group.worker_lanes.map((lane) => {
                            const active = activeLaneId === lane.lane_id;
                            return (
                              <SidebarMenuSubItem key={lane.lane_id}>
                                <SidebarMenuSubButton
                                  data-lane-id={lane.lane_id}
                                  data-testid="chat-lane-button"
                                  isActive={active}
                                  onClick={() => navigateToLane(lane.lane_id)}
                                  render={<button type="button" />}
                                  size="md"
                                  className="h-auto gap-2.5 px-2.5 py-2"
                                >
                                  <MessageSquareIcon className="mt-0.5 size-3.5" />
                                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden py-1 text-left">
                                    <span className="flex items-center justify-between gap-2">
                                      <span className="truncate text-sm">{lane.title}</span>
                                      <span className="shrink-0 text-[11px] text-muted-foreground/70">
                                        {formatRelativeTimeLabel(lane.updated_at)}
                                      </span>
                                    </span>
                                    <span className="truncate text-muted-foreground text-xs">
                                      {lane.preview_text ?? lane.subtitle ?? "No transcript yet."}
                                    </span>
                                  </span>
                                  {(lane.run_state === "running" ||
                                    lane.run_state === "queued" ||
                                    lane.run_state === "waiting_approval" ||
                                    lane.run_state === "error") && (
                                    <Badge
                                      size="sm"
                                      variant={laneStateVariant(lane.run_state) as
                                        | "error"
                                        | "warning"
                                        | "info"
                                        | "outline"}
                                    >
                                      {lane.run_state.replace("_", " ")}
                                    </Badge>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/60"
          aria-label="Settings stay in the outer console shell"
          title="Settings stay in the outer console shell."
        >
          <SettingsIcon className="size-4 text-muted-foreground" />
          <span className="font-medium text-xs">Settings</span>
        </button>
      </SidebarFooter>
    </>
  );
}
