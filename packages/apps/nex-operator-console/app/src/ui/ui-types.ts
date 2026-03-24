export type ChatAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
};

export type ChatQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  refreshSessions?: boolean;
};

export const CRON_CHANNEL_LAST = "last";

export type ScheduleFormState = {
  name: string;
  jobDefinitionId: string;
  enabled: boolean;
  expression: string;
  timezone: string;
  activeFrom: string;
  activeUntil: string;
};
