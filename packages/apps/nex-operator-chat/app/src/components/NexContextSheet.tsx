import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { requestLaneContextDetail, selectLaneDeliveryTarget } from "../nex/chat-adapter";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "./ui/sheet";

type NexContextSheetProps = {
  laneId: string;
  laneTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatRecordTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Unknown time";
  }
  return new Date(timestamp).toLocaleString();
}

export function NexContextSheet({
  laneId,
  laneTitle,
  open,
  onOpenChange,
}: NexContextSheetProps) {
  const [isUpdatingDelivery, setIsUpdatingDelivery] = useState(false);
  const laneContextQuery = useQuery({
    queryKey: ["nex-chat-context", laneId],
    enabled: open,
    queryFn: () =>
      requestLaneContextDetail(laneId, {
        include_conversation_context: true,
        message_limit: 1,
        approval_limit: 1,
        record_limit: 25,
      }),
  });

  const detail = laneContextQuery.data;
  const conversationContext = detail?.conversation_context;
  const deliveryTargets = conversationContext?.delivery_targets ?? [];
  const selectedDeliveryTarget = deliveryTargets.find((target) => target.selected) ?? null;
  const records = conversationContext?.records ?? [];

  const handleDeliveryChange = async (targetId: string) => {
    if (!targetId || targetId === selectedDeliveryTarget?.target_id) {
      return;
    }
    setIsUpdatingDelivery(true);
    try {
      await selectLaneDeliveryTarget(laneId, targetId);
      await laneContextQuery.refetch();
    } finally {
      setIsUpdatingDelivery(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup
        side="right"
        keepMounted
        className="w-[min(92vw,28rem)] max-w-[28rem]"
        data-testid="chat-context-sheet"
      >
        <SheetHeader>
          <SheetTitle>Linked context</SheetTitle>
          <SheetDescription>
            Delivery targets and public conversation records linked to {laneTitle}.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-4">
          {laneContextQuery.isLoading ? (
            <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3 text-sm text-muted-foreground">
              Loading linked context...
            </div>
          ) : laneContextQuery.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {laneContextQuery.error instanceof Error
                ? laneContextQuery.error.message
                : "Failed to load linked context."}
            </div>
          ) : (
            <>
              <section
                className="rounded-2xl border border-border/70 bg-card/60 px-4 py-4"
                data-testid="chat-delivery-panel"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Selected delivery</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedDeliveryTarget
                      ? `${selectedDeliveryTarget.label} via ${selectedDeliveryTarget.channel}`
                      : "No linked delivery targets."}
                  </p>
                </div>
                {deliveryTargets.length > 0 ? (
                  <label className="mt-3 block space-y-2 text-sm">
                    <span className="text-muted-foreground">Switch delivery target</span>
                    <select
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                      data-testid="chat-delivery-select"
                      disabled={isUpdatingDelivery}
                      onChange={(event) => void handleDeliveryChange(event.currentTarget.value)}
                      value={selectedDeliveryTarget?.target_id ?? ""}
                    >
                      {deliveryTargets.map((target) => (
                        <option key={target.target_id} value={target.target_id}>
                          {target.label} via {target.channel}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </section>

              <section className="space-y-3">
                <div className="space-y-1 px-1">
                  <h3 className="text-sm font-medium text-foreground">Linked public context</h3>
                  <p className="text-sm text-muted-foreground">
                    Canonical public records attached to this lane.
                  </p>
                </div>
                {records.length > 0 ? (
                  records.map((record) => (
                    <article
                      key={record.id}
                      data-testid="chat-conversation-record"
                      className="rounded-2xl border border-border/70 bg-card/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {record.channel}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRecordTimestamp(record.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {record.text}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {(record.sender_entity_id ?? "unknown sender") +
                          " to " +
                          (record.receiver_entity_id ?? "unknown receiver")}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                    No linked public conversation records for this lane.
                  </div>
                )}
              </section>
            </>
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
