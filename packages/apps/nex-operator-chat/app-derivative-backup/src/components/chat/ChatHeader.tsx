import { PanelRightIcon } from "lucide-react";
import { memo } from "react";
import { Badge } from "../ui/badge";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { SidebarTrigger } from "../ui/sidebar";
import type { ChatLaneAction } from "../../types";

interface ChatHeaderProps {
  laneTitle: string;
  groupTitle: string | null;
  runState: string;
  laneSubtitle?: string | null;
  laneActions: ChatLaneAction[];
  preferredActionId?: string | null;
  contextPanelOpen: boolean;
  onRunLaneAction: (action: ChatLaneAction) => void;
  onAddLaneAction: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateLaneAction: (actionId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteLaneAction: (actionId: string) => Promise<void>;
  onToggleContextPanel: () => void;
}

function runStateVariant(runState: string) {
  if (runState === "error") return "error";
  if (runState === "waiting_approval") return "warning";
  if (runState === "running" || runState === "queued") return "info";
  return "outline";
}

export const ChatHeader = memo(function ChatHeader(props: ChatHeaderProps) {
  const showGroupBadge =
    props.groupTitle != null && props.groupTitle.trim().length > 0 && props.groupTitle !== props.laneTitle;

  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <h2
          className="min-w-0 shrink truncate text-sm font-medium text-foreground"
          data-testid="chat-lane-title"
          title={props.laneTitle}
        >
          {props.laneTitle}
        </h2>
        {showGroupBadge ? (
          <Badge variant="outline" className="min-w-0 shrink overflow-hidden">
            <span className="min-w-0 truncate">{props.groupTitle}</span>
          </Badge>
        ) : null}
        <Badge
          data-testid="chat-run-state"
          size="sm"
          variant={runStateVariant(props.runState) as "error" | "warning" | "info" | "outline"}
        >
          {props.runState.replace("_", " ")}
        </Badge>
        {props.laneSubtitle ? (
          <span className="hidden truncate text-muted-foreground text-xs lg:inline">
            {props.laneSubtitle}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3">
        <ProjectScriptsControl
          scripts={props.laneActions}
          preferredScriptId={props.preferredActionId ?? null}
          onRunScript={props.onRunLaneAction}
          onAddScript={props.onAddLaneAction}
          onUpdateScript={props.onUpdateLaneAction}
          onDeleteScript={props.onDeleteLaneAction}
        />
        <button
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
            props.contextPanelOpen
              ? "border-primary/35 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          data-testid="chat-context-toggle"
          onClick={props.onToggleContextPanel}
          title="Toggle linked conversation panel"
          type="button"
        >
          <PanelRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
});
