import type { LogLevel } from "./types.ts";
import type { ScheduleFormState } from "./ui-types.ts";

export const DEFAULT_LOG_LEVEL_FILTERS: Record<LogLevel, boolean> = {
  trace: true,
  debug: true,
  info: true,
  warn: true,
  error: true,
  fatal: true,
};

export const DEFAULT_SCHEDULE_FORM: ScheduleFormState = {
  name: "",
  jobDefinitionId: "",
  enabled: true,
  expression: "0 7 * * *",
  timezone: "",
  activeFrom: "",
  activeUntil: "",
};
