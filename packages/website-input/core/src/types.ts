export type ConsentState = "granted" | "denied" | "unknown";

export type CanonicalEventName =
  | "page_view"
  | "content_view"
  | "cta_click"
  | "handoff_start"
  | "handoff_confirmed"
  | "handoff_unconfirmed"
  | "form_view"
  | "form_start"
  | "form_submit"
  | "booking_start"
  | "booking_complete"
  | "product_view"
  | "cart_add"
  | "checkout_start"
  | "checkout_created"
  | "checkout_complete";

export type BridgeSurface =
  | "checkout"
  | "form"
  | "booking"
  | "lead"
  | "intake"
  | "payment";

export interface WebsiteEvent {
  event_id: string;
  captured_at: string;
  event_name: CanonicalEventName;
  consent_state: ConsentState;
  session_id: string;
  page_url: string;
  page_path: string;
  host: string;
  browser_id: string | null;
  referrer?: string;
  event_source_url?: string;
  page_title?: string;
  user_agent?: string;
  viewport_width?: number;
  viewport_height?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  ttclid?: string;
  ttp?: string;
  msclkid?: string;
  surface_id?: string;
  surface_label?: string;
  surface_category?: string;
  target_type?: string;
  target_id?: string;
  target_label?: string;
  bridge_surface?: BridgeSurface;
  handoff_id?: string;
  checkout_token?: string;
  checkout_key?: string;
  checkout_id?: string;
  cart_token?: string;
  form_id?: string;
  form_submission_id?: string;
  booking_id?: string;
  booking_slot_id?: string;
  lead_external_id?: string;
  product_id?: string;
  variant_id?: string;
  quantity?: number;
  metadata_json?: Record<string, unknown>;
}

export type TrackEventInput = Omit<
  Partial<WebsiteEvent>,
  | "event_id"
  | "captured_at"
  | "consent_state"
  | "session_id"
  | "page_url"
  | "page_path"
  | "host"
  | "browser_id"
> & { event_name: CanonicalEventName };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface BrowserLocationLike {
  href: string;
  pathname: string;
  search: string;
  host: string;
}

export interface BrowserDocumentLike {
  referrer?: string;
  title?: string;
  cookie?: string;
}

export interface BrowserNavigatorLike {
  userAgent?: string;
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
}

export interface BrowserEnvironment {
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  location: BrowserLocationLike;
  document?: BrowserDocumentLike;
  navigator?: BrowserNavigatorLike;
  fetch?: typeof fetch;
  innerWidth?: number;
  innerHeight?: number;
}

export interface CollectorBatchRequest {
  website_installation_id: string;
  events: WebsiteEvent[];
}

export interface WebsiteInputSender {
  send(batch: CollectorBatchRequest): Promise<void> | void;
}

export interface BrowserTrackerConfig {
  websiteInstallationId: string;
  collectorUrl: string;
  consentState?: ConsentState | (() => ConsentState);
  environment?: BrowserEnvironment;
  sender?: WebsiteInputSender;
  storagePrefix?: string;
  deploymentVersion?: string;
  now?: () => Date;
  randomId?: () => string;
}
