import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIBABA_CONVERSATION_LIST_METHOD,
  ALIBABA_MESSAGE_LIST_METHOD,
  ALIBABA_OPEN_PLATFORM_ENDPOINT,
  assessAlibabaOpenPlatformEligibility,
  buildAlibabaTopRequest,
  probeAlibabaOpenPlatformReadAccess,
  readAlibabaOpenPlatformInputs,
  signAlibabaTopParams,
} from "./open-platform.ts";

test("assessment reports only presence and never credential values", () => {
  const inputs = readAlibabaOpenPlatformInputs({
    ALIBABA_OPEN_PLATFORM_APP_KEY: "app-key-private",
    ALIBABA_OPEN_PLATFORM_APP_SECRET: "app-secret-private",
  });
  const assessment = assessAlibabaOpenPlatformEligibility(inputs);
  assert.equal(assessment.state, "blocked_missing_account_identifiers");
  assert.equal(assessment.provider_call_performed, false);
  assert.doesNotMatch(JSON.stringify(assessment), /app-key-private|app-secret-private/);
});

test("signed request is deterministic and excludes the secret", () => {
  const params = {
    app_key: "app-key",
    format: "json",
    method: ALIBABA_CONVERSATION_LIST_METHOD,
    params: '{"count":1}',
    sign_method: "hmac",
    timestamp: "2026-07-21 20:00:00",
    v: "2.0",
  };
  const signature = signAlibabaTopParams(params, "top-secret");
  assert.match(signature, /^[0-9A-F]{32}$/);
  const request = buildAlibabaTopRequest({
    app_key: "app-key",
    app_secret: "top-secret",
    method: ALIBABA_CONVERSATION_LIST_METHOD,
    params: { seller_account_id: "123", limit_time_stamp: 0, count: 1 },
    now: new Date("2026-07-21T12:00:00.000Z"),
  });
  assert.equal(request.get("timestamp"), "2026-07-21 20:00:00");
  assert.equal(request.get("method"), ALIBABA_CONVERSATION_LIST_METHOD);
  assert.equal(request.has("app_secret"), false);
  assert.doesNotMatch(request.toString(), /top-secret/);
});

test("live-shaped read probe checks conversation then message without returning content", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const payloads = [
    {
      alibaba_interaction_im_conversation_list_query_response: {
        result: {
          success: true,
          data: {
            list: { conversation_d_t_o: [{ conversation_id: "conversation-private" }] },
          },
        },
      },
    },
    {
      alibaba_interaction_im_message_list_query_response: {
        result: {
          success: true,
          data: {
            list: {
              message_d_t_o: [
                {
                  message_id: "message-private",
                  content: "supplier-private-content",
                },
              ],
            },
          },
        },
      },
    },
  ];
  const result = await probeAlibabaOpenPlatformReadAccess({
    credentials: {
      app_key: "app-key",
      app_secret: "app-secret",
      seller_account_id: "seller-123",
      self_account_id: "self-456",
    },
    now: new Date("2026-07-21T12:00:00.000Z"),
    fetcher: async (input, init) => {
      calls.push({ url: String(input), init });
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payloads.shift(),
      };
    },
  });
  assert.deepEqual(result, {
    state: "eligible",
    conversation_list_accessible: true,
    message_list_accessible: true,
    conversation_count: 1,
    message_count: 1,
    provider_call_performed: true,
    remote_mutation_enabled: false,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, ALIBABA_OPEN_PLATFORM_ENDPOINT);
  assert.equal(calls[0]?.init?.redirect, "manual");
  assert.match(String(calls[0]?.init?.body), new RegExp(ALIBABA_CONVERSATION_LIST_METHOD));
  assert.match(String(calls[1]?.init?.body), new RegExp(ALIBABA_MESSAGE_LIST_METHOD));
  assert.doesNotMatch(JSON.stringify(result), /conversation-private|message-private|supplier-private-content/);
});

test("provider refusal is sanitized and prevents the message read", async () => {
  let calls = 0;
  const result = await probeAlibabaOpenPlatformReadAccess({
    credentials: {
      app_key: "app-key",
      app_secret: "app-secret",
      seller_account_id: "seller-123",
      self_account_id: "self-456",
    },
    fetcher: async () => {
      calls += 1;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          error_response: {
            code: 50,
            sub_code: "isv.permission-api-package-limit",
            sub_msg: "private provider detail",
          },
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.state, "api_refused");
  assert.equal(result.provider_error_code, "isv.permission-api-package-limit");
  assert.doesNotMatch(JSON.stringify(result), /private provider detail/);
});
