import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCredential,
  parseWorkspace,
  summarizeRequestLogs,
  fetchRequestLogs,
  renderSummaryText,
  renderSessionSnapshot,
  hourlyBuckets,
  UpstreamError,
} from "../index.js";

const T0 = 1_800_000_000_000;

function row(overrides = {}) {
  return {
    id: "log_" + Math.random().toString(16).slice(2),
    startedAt: T0 + 1000,
    finishedAt: T0 + 4000,
    durationMs: 3000,
    outcome: "succeeded",
    category: "inference",
    provider: "opencode-go",
    model: "deepseek-v4.1-flash",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 1000,
    cacheWriteTokens: 0,
    cost: 0.001,
    ...overrides,
  };
}

test("summarizeRequestLogs sums cost inside the window only", () => {
  const items = [
    row({ cost: 0.001, startedAt: T0 + 10 }),
    row({ cost: 0.002, startedAt: T0 + 20 }),
    row({ cost: 0.5, startedAt: T0 - 1 }), // before the session
    row({ cost: 0.4, startedAt: T0 + 10_000 }), // after `until`
  ];
  const summary = summarizeRequestLogs(items, T0, T0 + 5000);
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.costUsd, 0.003);
});

test("summarizeRequestLogs keeps float sums from drifting", () => {
  const items = Array.from({ length: 10 }, () => row({ cost: 0.1 }));
  const summary = summarizeRequestLogs(items, T0, T0 + 5000);
  assert.equal(summary.totals.costUsd, 1);
});

test("summarizeRequestLogs counts tokens, unpriced rows and outcomes", () => {
  const items = [
    row({ outcome: "succeeded", inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 }),
    row({ outcome: "failed", cost: undefined, inputTokens: 1, outputTokens: 0, cacheReadTokens: 0 }),
    row({ outcome: "rejected", cost: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }),
  ];
  const summary = summarizeRequestLogs(items, T0, T0 + 5000);
  assert.equal(summary.totals.requests, 3);
  assert.equal(summary.totals.unpriced, 1);
  assert.equal(summary.totals.inputTokens, 11);
  assert.equal(summary.totals.outputTokens, 5);
  assert.equal(summary.totals.cacheReadTokens, 100);
  assert.equal(summary.totals.tokens, 116);
  assert.deepEqual(summary.outcomes, { succeeded: 1, failed: 1, cancelled: 0, rejected: 1 });
});

test("summarizeRequestLogs groups by provider and model, costliest first", () => {
  const items = [
    row({ model: "a", cost: 0.0001, inputTokens: 1, outputTokens: 0, cacheReadTokens: 0 }),
    row({ model: "b", cost: 0.0009, inputTokens: 2, outputTokens: 0, cacheReadTokens: 0 }),
    row({ model: "b", cost: 0.0001, inputTokens: 3, outputTokens: 0, cacheReadTokens: 0 }),
  ];
  const summary = summarizeRequestLogs(items, T0, T0 + 5000);
  assert.equal(summary.models.length, 2);
  assert.equal(summary.models[0].model, "b");
  assert.equal(summary.models[0].requests, 2);
  assert.equal(summary.models[0].costUsd, 0.001);
  assert.equal(summary.models[0].tokens, 5);
  assert.equal(summary.models[1].model, "a");
});

test("summarizeRequestLogs falls back to finishedAt - startedAt for duration", () => {
  const summary = summarizeRequestLogs(
    [row({ durationMs: undefined, startedAt: T0 + 1000, finishedAt: T0 + 2500 })],
    T0,
    T0 + 5000,
  );
  assert.equal(summary.recent[0].durationMs, 1500);
});

test("summarizeRequestLogs orders recent rows newest first and caps them", () => {
  const items = Array.from({ length: 9 }, (_, index) => row({ startedAt: T0 + index * 10 }));
  const summary = summarizeRequestLogs(items, T0, T0 + 5000);
  assert.equal(summary.recent.length, 6);
  assert.equal(summary.recent[0].startedAt, T0 + 80);
  assert.equal(summary.recent[5].startedAt, T0 + 30);
});

test("summarizeRequestLogs tolerates junk rows", () => {
  const summary = summarizeRequestLogs([null, undefined, "nope", {}, row()], T0, T0 + 5000);
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.costUsd, 0.001);
});

test("parseCredential reads a pasted cookie header and strips its prefix", () => {
  const result = parseCredential("  Cookie: oc_session=abc123; other=1  ");
  assert.equal(result.ok, true);
  assert.equal(result.kind, "cookie");
  assert.equal(result.value, "oc_session=abc123; other=1");
});

test("parseCredential reads a pasted authorization header as a bearer token", () => {
  const result = parseCredential("Authorization: Bearer abcdef0123456789");
  assert.equal(result.ok, true);
  assert.equal(result.kind, "bearer");
  assert.equal(result.value, "abcdef0123456789");
});

test("parseCredential treats a bare token as bearer and a bare pair as cookie", () => {
  assert.deepEqual(parseCredential("oc_sk_1234567890abcdef"), {
    ok: true,
    kind: "bearer",
    value: "oc_sk_1234567890abcdef",
  });
  assert.deepEqual(parseCredential("oc_locale=en"), { ok: true, kind: "cookie", value: "oc_locale=en" });
});

test("parseCredential rejects header-splitting, empty, and shapeless values", () => {
  assert.equal(parseCredential("a=1\r\nX-Evil: 1").ok, false);
  assert.equal(parseCredential("").ok, false);
  assert.equal(parseCredential("just-text").ok, false);
  assert.equal(parseCredential(undefined).ok, false);
});

test("parseWorkspace accepts a bare id or a console URL", () => {
  assert.equal(parseWorkspace("wrk_01M2DZEEH9Z3RNDJXDG106F903").value, "wrk_01M2DZEEH9Z3RNDJXDG106F903");
  assert.equal(
    parseWorkspace("https://opencode.ai/console/wrk_01M2DZEEH9Z3RNDJXDG106F903/activity/logs").value,
    "wrk_01M2DZEEH9Z3RNDJXDG106F903",
  );
  assert.equal(parseWorkspace("org_01M5YCJMD1B4TTE1W34Y2EBADS").value, "org_01M5YCJMD1B4TTE1W34Y2EBADS");
  assert.equal(parseWorkspace("nope").ok, false);
});

test("fetchRequestLogs pages until the window start and reports retention", async () => {
  const calls = [];
  const pages = [
    {
      items: [row({ startedAt: T0 + 3000 }), row({ startedAt: T0 + 2000 })],
      nextCursor: "c1",
      retentionDays: 30,
    },
    {
      items: [row({ startedAt: T0 + 1000 }), row({ startedAt: T0 - 5000 })],
      nextCursor: "c2",
      retentionDays: 30,
    },
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = pages[Math.min(calls.length - 1, pages.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  try {
    const result = await fetchRequestLogs({ base: "https://opencode.ai", auth: { kind: "cookie", value: "a=1" }, since: T0, until: T0 + 5000, maxPages: 10 });
    assert.equal(calls.length, 2, "stops before asking for a third page");
    assert.match(calls[0], /category=inference/);
    assert.match(calls[0], /since=1800000000000/);
    assert.match(calls[1], /cursor=c1/);
    assert.equal(result.items.length, 4);
    assert.equal(result.retentionDays, 30);
    assert.equal(result.truncated, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchRequestLogs marks truncation when the page cap is hit", async () => {
  const original = globalThis.fetch;
  let page = 0;
  globalThis.fetch = async () => {
    page++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [row({ startedAt: T0 + 2000 })], nextCursor: "more", retentionDays: 30 }),
      text: async () => "",
    };
  };
  try {
    const result = await fetchRequestLogs({ base: "https://opencode.ai", auth: { kind: "cookie", value: "a=1" }, since: T0, until: T0 + 5000, maxPages: 2 });
    assert.equal(page, 2);
    assert.equal(result.truncated, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("renderSummaryText prints the totals of a live payload", () => {
  const payload = {
    ok: true,
    session: { id: "session-1", startedAt: T0, until: T0 + 600_000, durationMs: 600_000 },
    totals: {
      costUsd: 0.0042,
      requests: 4,
      tokens: 12_300,
      inputTokens: 1_200,
      outputTokens: 300,
      cacheReadTokens: 10_800,
      cacheWriteTokens: 0,
    },
    models: [{ model: "deepseek-v4.1-flash", costUsd: 0.0042, requests: 4, tokens: 12_300 }],
    recent: [{ startedAt: T0 + 1000, model: "deepseek-v4.1-flash", durationMs: 7500, costUsd: 0.0008, outcome: "succeeded" }],
    retentionDays: 30,
  };
  const text = renderSummaryText(payload);
  assert.match(text, /session cost \$0\.0042/);
  assert.match(text, /Requests 4 · 12\.3k tokens/);
  assert.match(text, /deepseek-v4\.1-flash {2}\$0\.0042 {2}4 req/);
  assert.match(text, /kept for 30 days/);
});

test("renderSummaryText explains a missing session", () => {
  const text = renderSummaryText({ ok: false, code: "no-credential" });
  assert.match(text, /No console session/);
  assert.match(text, /OPENCODE_CONSOLE_COOKIE/);
});

test("renderSummaryText explains a missing workspace", () => {
  const text = renderSummaryText({ ok: false, code: "org-required" });
  assert.match(text, /needs a workspace id/);
});

test("renderSummaryText survives an undefined payload", () => {
  assert.equal(renderSummaryText(undefined), "OpenCode Go: no data.");
});

test("fetchRequestLogs surfaces the console status on rejection", async () => {  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ _tag: "Forbidden" }),
    text: async () => '{"_tag":"Forbidden"}',
  });
  try {
    await assert.rejects(
      () => fetchRequestLogs({ base: "https://opencode.ai", auth: { kind: "cookie", value: "a=1" }, since: T0, until: T0 + 1000, maxPages: 1 }),
      (error) => {
        assert.ok(error instanceof UpstreamError);
        assert.equal(error.status, 403);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("hourlyBuckets groups by local hour, oldest first", () => {
  const base = new Date(2026, 9, 28, 5, 40, 0).getTime();
  const items = [
    row({ startedAt: base, cost: 0.001, inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 }),
    row({ startedAt: base + 60_000, cost: 0.002, inputTokens: 20, outputTokens: 5, cacheReadTokens: 0 }),
    row({ startedAt: base + 3_600_000, cost: 0.004, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 }),
    row({ startedAt: undefined, cost: 9 }),
  ];
  const buckets = hourlyBuckets(items);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].hour, "05:00");
  assert.equal(buckets[0].requests, 2);
  assert.equal(buckets[0].costUsd, 0.003);
  assert.equal(buckets[0].tokens, 140);
  assert.equal(buckets[1].hour, "06:00");
  assert.equal(buckets[1].requests, 1);
});

test("renderSessionSnapshot prints the benchmark blocks", () => {
  const text = renderSessionSnapshot({
    session: { id: "session-eb5c23ae-f01b", startedAt: T0, until: T0 + 3_814_000, durationMs: 3_814_000 },
    totals: {
      costUsd: 0.386123,
      requests: 284,
      tokens: 69_200_000,
      inputTokens: 421_400,
      outputTokens: 204_100,
      cacheReadTokens: 66_900_000,
      cacheWriteTokens: 0,
      reasoningTokens: 92_716,
      unpriced: 0,
    },
    outcomes: { succeeded: 284, failed: 0, cancelled: 0, rejected: 0 },
    models: [{ model: "deepseek-v4.1-flash", provider: "opencode", requests: 284, tokens: 69_200_000, costUsd: 0.386123 }],
    recent: [{ startedAt: T0 + 3_000_000, durationMs: 4182, inputTokens: 431, outputTokens: 121, costUsd: 0.0012424, outcome: "succeeded" }],
    hourly: [{ hour: "05:00", requests: 95, tokens: 9_700_000, costUsd: 0.0977 }],
    meta: { savedAt: T0 + 4_000_000, workspace: "wrk_01M2", credentialKind: "cookie", retentionDays: 30 },
  });

  assert.match(text, /^OpenCode Go — session cost snapshot/);
  assert.match(text, /session {2,}session-eb5c23ae-f01b/);
  assert.match(text, /cost {2,}\$0\.3861/);
  assert.match(text, /tokens per request {2,}243\.7k/);
  assert.match(text, /cost per request {2,}\$0\.00136/);
  assert.match(text, /deepseek-v4\.1-flash {2,}opencode {2,}284/);
  assert.match(text, /05:00 {2,}95/);
  assert.match(text, /succeeded 284 · failed 0/);
  assert.match(text, /matched by time window/);
});

test("renderSessionSnapshot flags partial and unpriced totals", () => {
  const text = renderSessionSnapshot({
    session: { id: "session-x", startedAt: T0, until: T0 + 1000, durationMs: 1000 },
    totals: { costUsd: 0, requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, unpriced: 3 },
    outcomes: {},
    models: [],
    recent: [],
    hourly: [],
    meta: { savedAt: T0, truncated: true, scanned: 2500 },
  });
  assert.match(text, /\(none\)/);
  assert.match(text, /only the newest 2500 requests were scanned/);
  assert.match(text, /3 requests carried no cost/);
});
test("renderSessionSnapshot includes the host-side DSH block", () => {
  const text = renderSessionSnapshot({
    session: { id: "session-x", startedAt: T0, until: T0 + 7_200_000, durationMs: 7_200_000 },
    totals: { costUsd: 0.4302, requests: 308, tokens: 79_900_000, inputTokens: 443_328, outputTokens: 210_219, cacheReadTokens: 79_206_272, cacheWriteTokens: 0, unpriced: 0 },
    outcomes: { succeeded: 308 },
    models: [],
    recent: [],
    hourly: [],
    dsh: {
      turns: 8,
      steps: 347,
      llmMs: 3_196_000,
      toolMs: 798_000,
      ttftMs: 1_457_000,
      ttftSteps: 347,
      decodeMs: 1_650_000,
      decodeTokens: 217_800,
      uncachedInputTokens: 469_990,
      cacheReadTokens: 96_669_440,
      cacheWriteTokens: 0,
      outputTokens: 229_142,
      totalTokens: 97_368_572,
      cacheHitRatio: 0.99516,
      contextWindow: 1_000_000,
      contextTokens: 450_100,
      systemTokens: 1_400,
      toolsTokens: 8_500,
      messageTokens: 395_000,
    },
    meta: { savedAt: T0 },
  });

  assert.match(text, /DSH session \(host-side\)/);
  assert.match(text, /steps {2,}347/);
  assert.match(text, /llm time {2,}53m 16s/);
  assert.match(text, /tool time {2,}13m 18s/);
  assert.match(text, /ttft \(avg\) {2,}4\.2s/);
  assert.match(text, /tokens\/sec {2,}132/);
  assert.match(text, /tokens total {2,}97\.4M/);
  assert.match(text, /cache hit {2,}99\.5%/);
  assert.match(text, /context {2,}45\.0% of 1\.0M \(450\.1k\)/);
  assert.match(text, /messages {2,}395\.0k/);
});

test("renderSessionSnapshot omits the DSH block when the host gives nothing", () => {
  const text = renderSessionSnapshot({
    session: { id: "session-x", startedAt: T0, until: T0 + 1000, durationMs: 1000 },
    totals: { costUsd: 0, requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, unpriced: 0 },
    outcomes: {},
    models: [],
    recent: [],
    hourly: [],
    meta: { savedAt: T0 },
  });
  assert.equal(/DSH session/.test(text), false);
});