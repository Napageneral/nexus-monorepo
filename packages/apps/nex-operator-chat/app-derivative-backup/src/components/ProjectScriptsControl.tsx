import {
  BugIcon,
  ChevronDownIcon,
  FlaskConicalIcon,
  HammerIcon,
  ListChecksIcon,
  PlayIcon,
  PlusIcon,
  WrenchIcon,
} from "lucide-react";
import React, { type FormEvent, type KeyboardEvent, useCallback, useMemo, useState } from "react";

import { isMacPlatform, randomUUID } from "~/lib/utils";
import type { ChatActionInvocationMode, ChatLaneAction } from "../types";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Group, GroupSeparator } from "./ui/group";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "./ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";

type LaneActionIcon = ChatLaneAction["icon"];

const ACTION_ICONS: Array<{ id: LaneActionIcon; label: string }> = [
  { id: "play", label: "Play" },
  { id: "test", label: "Test" },
  { id: "lint", label: "Lint" },
  { id: "configure", label: "Configure" },
  { id: "build", label: "Build" },
  { id: "debug", label: "Debug" },
];

export interface NewProjectScriptInput {
  label: string;
  default_prompt: string;
  icon: LaneActionIcon;
  shortcut: string | null;
  invocation_mode: ChatActionInvocationMode;
  requires_input: boolean;
}

interface ProjectScriptsControlProps {
  scripts: ChatLaneAction[];
  preferredScriptId?: string | null;
  onRunScript: (script: ChatLaneAction) => void;
  onAddScript: (input: NewProjectScriptInput) => Promise<void> | void;
  onUpdateScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void> | void;
  onDeleteScript: (scriptId: string) => Promise<void> | void;
}

function ScriptIcon({
  icon,
  className = "size-3.5",
}: {
  icon: LaneActionIcon;
  className?: string;
}) {
  if (icon === "test") return <FlaskConicalIcon className={className} />;
  if (icon === "lint") return <ListChecksIcon className={className} />;
  if (icon === "configure") return <WrenchIcon className={className} />;
  if (icon === "build") return <HammerIcon className={className} />;
  if (icon === "debug") return <BugIcon className={className} />;
  return <PlayIcon className={className} />;
}

function normalizeShortcutKeyToken(key: string): string | null {
  const normalized = key.toLowerCase();
  if (
    normalized === "meta" ||
    normalized === "control" ||
    normalized === "ctrl" ||
    normalized === "shift" ||
    normalized === "alt" ||
    normalized === "option"
  ) {
    return null;
  }
  if (normalized === " ") return "space";
  if (normalized === "escape") return "esc";
  if (normalized === "arrowup") return "arrowup";
  if (normalized === "arrowdown") return "arrowdown";
  if (normalized === "arrowleft") return "arrowleft";
  if (normalized === "arrowright") return "arrowright";
  if (normalized.length === 1) return normalized;
  if (normalized.startsWith("f") && normalized.length <= 3) return normalized;
  if (normalized === "enter" || normalized === "tab" || normalized === "backspace") {
    return normalized;
  }
  if (normalized === "delete" || normalized === "home" || normalized === "end") {
    return normalized;
  }
  if (normalized === "pageup" || normalized === "pagedown") return normalized;
  return null;
}

function keybindingFromEvent(event: KeyboardEvent<HTMLInputElement>): string | null {
  const keyToken = normalizeShortcutKeyToken(event.key);
  if (!keyToken) return null;

  const parts: string[] = [];
  if (isMacPlatform(navigator.platform)) {
    if (event.metaKey) parts.push("mod");
    if (event.ctrlKey) parts.push("ctrl");
  } else {
    if (event.ctrlKey) parts.push("mod");
    if (event.metaKey) parts.push("meta");
  }
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (parts.length === 0) {
    return null;
  }
  parts.push(keyToken);
  return parts.join("+");
}

function primaryProjectScript(scripts: ChatLaneAction[]): ChatLaneAction | null {
  return scripts[0] ?? null;
}

function nextProjectScriptId(existingIds: string[]): string {
  while (true) {
    const next = `action:${randomUUID()}`;
    if (!existingIds.includes(next)) {
      return next;
    }
  }
}

export default function ProjectScriptsControl({
  scripts,
  preferredScriptId = null,
  onRunScript,
  onAddScript,
  onUpdateScript,
  onDeleteScript,
}: ProjectScriptsControlProps) {
  const addScriptFormId = React.useId();
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [icon, setIcon] = useState<LaneActionIcon>("play");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [invocationMode, setInvocationMode] = useState<ChatActionInvocationMode>("prefill");
  const [requiresInput, setRequiresInput] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const primaryScript = useMemo(() => {
    if (preferredScriptId) {
      const preferred = scripts.find((script) => script.action_id === preferredScriptId);
      if (preferred) return preferred;
    }
    return primaryProjectScript(scripts);
  }, [preferredScriptId, scripts]);

  const dropdownItemClassName =
    "data-highlighted:bg-transparent data-highlighted:text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground data-highlighted:hover:bg-accent data-highlighted:hover:text-accent-foreground data-highlighted:focus-visible:bg-accent data-highlighted:focus-visible:text-accent-foreground";

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      setShortcut("");
      return;
    }
    const next = keybindingFromEvent(event);
    if (!next) return;
    setShortcut(next);
  };

  const submitAction = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedLabel = label.trim();
    const trimmedPrompt = defaultPrompt.trim();
    if (trimmedLabel.length === 0) {
      setValidationError("Name is required.");
      return;
    }
    if (trimmedPrompt.length === 0) {
      setValidationError("Default prompt is required.");
      return;
    }

    setValidationError(null);
    try {
      const payload = {
        label: trimmedLabel,
        default_prompt: trimmedPrompt,
        icon,
        shortcut: shortcut.trim().length > 0 ? shortcut.trim() : null,
        invocation_mode: invocationMode,
        requires_input: requiresInput,
      } satisfies NewProjectScriptInput;

      if (editingScriptId) {
        await onUpdateScript(editingScriptId, payload);
      } else {
        void nextProjectScriptId(scripts.map((script) => script.action_id));
        await onAddScript(payload);
      }
      setDialogOpen(false);
      setIconPickerOpen(false);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Failed to save action.");
    }
  };

  const openAddDialog = () => {
    setEditingScriptId(null);
    setLabel("");
    setDefaultPrompt("");
    setIcon("play");
    setIconPickerOpen(false);
    setShortcut("");
    setInvocationMode("prefill");
    setRequiresInput(true);
    setValidationError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (script: ChatLaneAction) => {
    setEditingScriptId(script.action_id);
    setLabel(script.label);
    setDefaultPrompt(script.default_prompt ?? "");
    setIcon(script.icon);
    setIconPickerOpen(false);
    setShortcut(script.shortcut ?? "");
    setInvocationMode(script.invocation_mode);
    setRequiresInput(script.requires_input);
    setValidationError(null);
    setDialogOpen(true);
  };

  const confirmDeleteScript = useCallback(() => {
    if (!editingScriptId) return;
    setDeleteConfirmOpen(false);
    setDialogOpen(false);
    void onDeleteScript(editingScriptId);
  }, [editingScriptId, onDeleteScript]);

  return (
    <>
      {primaryScript ? (
        <Group aria-label="Lane actions">
          <Button
            data-testid="chat-lane-action-primary"
            size="xs"
            variant="outline"
            onClick={() => onRunScript(primaryScript)}
            title={`Run ${primaryScript.label}`}
          >
            <ScriptIcon icon={primaryScript.icon} />
            <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
              {primaryScript.label}
            </span>
          </Button>
          <GroupSeparator className="hidden @3xl/header-actions:block" />
          <Menu highlightItemOnHover={false}>
            <MenuTrigger
              render={
                <Button
                  data-testid="chat-lane-action-menu"
                  size="icon-xs"
                  variant="outline"
                  aria-label="Action controls"
                />
              }
            >
              <ChevronDownIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              {scripts.map((script) => (
                <MenuItem
                  data-testid="chat-lane-action-item"
                  data-action-id={script.action_id}
                  key={script.action_id}
                  className={`group ${dropdownItemClassName}`}
                  onClick={() => onRunScript(script)}
                >
                  <ScriptIcon icon={script.icon} className="size-4" />
                  <span className="truncate">{script.label}</span>
                  <span className="relative ms-auto flex h-6 min-w-6 items-center justify-end">
                    {script.shortcut ? (
                      <MenuShortcut className="ms-0 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
                        {script.shortcut}
                      </MenuShortcut>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-0 top-1/2 size-6 -translate-y-1/2 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-visible:opacity-100 group-focus-visible:pointer-events-auto"
                      aria-label={`Edit ${script.label}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openEditDialog(script);
                      }}
                    >
                      <WrenchIcon className="size-3.5" />
                    </Button>
                  </span>
                </MenuItem>
              ))}
              <MenuItem data-testid="chat-lane-action-add" onClick={openAddDialog}>
                <PlusIcon className="size-4" />
                Add action
              </MenuItem>
            </MenuPopup>
          </Menu>
        </Group>
      ) : (
        <Button data-testid="chat-lane-action-add" size="xs" variant="outline" onClick={openAddDialog}>
          <PlusIcon className="size-4" />
          Add action
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup className="sm:max-w-xl">
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>{editingScriptId ? "Edit action" : "Create action"}</DialogTitle>
              <DialogDescription>
                Preserve the upstream action bar, but back it with Nex-native lane actions.
              </DialogDescription>
            </DialogHeader>
            <form id={addScriptFormId} className="grid gap-4" onSubmit={(event) => void submitAction(event)}>
              <div className="grid gap-2">
                <Label htmlFor="lane-action-label">Name</Label>
                <Input
                  data-testid="chat-lane-action-label-input"
                  id="lane-action-label"
                  value={label}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                  placeholder="Retained proof"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lane-action-prompt">Default prompt</Label>
                <Textarea
                  data-testid="chat-lane-action-prompt-input"
                  id="lane-action-prompt"
                  rows={6}
                  value={defaultPrompt}
                  onChange={(event) => setDefaultPrompt(event.currentTarget.value)}
                  placeholder="Use the mounted capability tree to..."
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Icon</Label>
                  <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                    <PopoverTrigger
                      render={
                        <Button variant="outline" className="justify-between">
                          <span className="inline-flex items-center gap-2">
                            <ScriptIcon icon={icon} />
                            {ACTION_ICONS.find((entry) => entry.id === icon)?.label ?? "Play"}
                          </span>
                          <ChevronDownIcon className="size-4" />
                        </Button>
                      }
                    />
                    <PopoverPopup className="w-44 p-1">
                      {ACTION_ICONS.map((entry) => (
                        <Button
                          key={entry.id}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => {
                            setIcon(entry.id);
                            setIconPickerOpen(false);
                          }}
                        >
                          <ScriptIcon icon={entry.id} />
                          {entry.label}
                        </Button>
                      ))}
                    </PopoverPopup>
                  </Popover>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="lane-action-shortcut">Shortcut</Label>
                  <Input
                    id="lane-action-shortcut"
                    value={shortcut}
                    onKeyDown={captureKeybinding}
                    onChange={(event) => setShortcut(event.currentTarget.value)}
                    placeholder="mod+shift+r"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">Prefill composer</span>
                    <span className="text-muted-foreground text-xs">
                      Keep the operator in the loop before send.
                    </span>
                  </span>
                  <Switch
                    data-testid="chat-lane-action-invocation-mode"
                    checked={invocationMode === "invoke"}
                    onCheckedChange={(checked) => setInvocationMode(checked ? "invoke" : "prefill")}
                  />
                </label>

                <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">Requires input</span>
                    <span className="text-muted-foreground text-xs">
                      Allow freeform operator follow-up before invocation.
                    </span>
                  </span>
                  <Switch
                    data-testid="chat-lane-action-requires-input"
                    checked={requiresInput}
                    onCheckedChange={setRequiresInput}
                  />
                </label>
              </div>

              {validationError ? <p className="text-destructive text-sm">{validationError}</p> : null}
            </form>
            <DialogFooter>
              {editingScriptId ? (
                <Button variant="destructive-outline" onClick={() => setDeleteConfirmOpen(true)}>
                  Delete
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button data-testid="chat-lane-action-save" form={addScriptFormId} type="submit">
                {editingScriptId ? "Save action" : "Create action"}
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete action?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the action from the selected agent group. The linked lane transcript is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" onClick={confirmDeleteScript}>
              Delete action
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
