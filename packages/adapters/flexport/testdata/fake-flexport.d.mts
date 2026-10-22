// Types for the local fake Flexport server used by the package tests.
export declare const FAKE_CLIENT_ID: string;
export declare const FAKE_CLIENT_SECRET: string;
export declare const DEFAULT_FIXTURES: string;

export type FakeRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | null;
  flexport_version: string | null;
  accept: string | null;
  body: Buffer;
};

export type FakeInjection = {
  path: string;
  method?: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  times?: number;
};

export type FakeFixtures = Record<string, any>;

export type FakeFlexport = {
  url: string;
  port: number;
  fixtures: FakeFixtures;
  requests: FakeRequest[];
  downloads: Record<string, number>;
  readonly tokenRequests: number;
  apiRequests(): FakeRequest[];
  inject(entry: FakeInjection): void;
  close(): Promise<void>;
};

export declare function loadFixtures(path?: string): FakeFixtures;

export declare function startFakeFlexport(options?: {
  fixtures?: FakeFixtures;
  fixturesPath?: string;
  pageSize?: number;
  ignoreFilter?: string[];
  clientId?: string;
  clientSecret?: string;
  host?: string;
  port?: number;
}): Promise<FakeFlexport>;
