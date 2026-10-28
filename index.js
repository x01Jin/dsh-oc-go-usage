// @ts-check
/**
 * Host half. Reads the console request log for the session's own time window
 * and sums the billed cost.
 *
 * The log is the only place that knows what each request cost:
 * `GET /console/api/request-logs?category=inference&since=<ms>&until=<ms>`.
 * It requires the console session, not a personal API key (that answers 403),
 * so the cookie is kept in DSH credentials and only this process sends it.
 *
 * Routes, same origin as the Web GUI so the cookie never reaches the page:
 * GET /opencode-go/session-cost, POST and DELETE /opencode-go/session-cookie,
 * POST /opencode-go/session-export.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const DEFAULT_API_BASE = "https://opencode.ai";
const DEFAULT_CREDENTIAL_REF = "OPENCODE_CONSOLE_COOKIE";
/** Non-secret workspace id chosen for `x-org-id`, kept beside the credential. */
const WORKSPACE_REF = "OPENCODE_CONSOLE_WORKSPACE";
const DEFAULT_CACHE_MS = 20_000;
const DEFAULT_MAX_PAGES = 25;
const PAGE_SIZE = 100;
const MAX_COOKIE_BYTES = 8_192;
const REQUEST_TIMEOUT_MS = 20_000;
const RECENT_LIMIT = 6;

/** Required services: HTTP routes for the browser half, credentials for the cookie, agents for session windows. */
export const inject = ["webServer", "credentials", "agents", "commands"];

/**
 * One page of the console request log.
 * @param {{base: string, auth: ConsoleAuth, orgId?: string, since: number, until: number, maxPages: number}} options
 * @returns {Promise<{items: any[], truncated: boolean, retentionDays: number | undefined}>}
 */
export async function fetchRequestLogs({ base, auth, orgId, since, until, maxPages }) {
  /** @type {any[]} */
  const items = [];
  /** @type {string | undefined} */
  let cursor;
  let pages = 0;
  let truncated = false;
  /** @type {number | undefined} */
  let retentionDays;

  while (pages < maxPages) {
    const url = new URL(`${base.replace(/\/+$/, "")}/console/api/request-logs`);
    url.searchParams.set("category", "inference");
    url.searchParams.set("since", String(Math.max(0, Math.floor(since))));
    url.searchParams.set("until", String(Math.max(0, Math.floor(until))));
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);

    const headers = { accept: "application/json", ...authHeaders(auth) };
    if (orgId !== undefined) headers["x-org-id"] = orgId;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    if (!res.ok) {
      throw new UpstreamError(res.status, await readSnippet(res));
    }

    /** @type {any} */
    let body;
    try {
      body = await res.json();
    } catch {
      throw new UpstreamError(res.status, "response was not JSON");
    }
    if (typeof body?.retentionDays === "number") retentionDays = body.retentionDays;

    const batch = Array.isArray(body?.items) ? body.items : [];
    items.push(...batch);
    cursor = typeof body?.nextCursor === "string" && body.nextCursor.length > 0 ? body.nextCursor : undefined;
    pages++;

    if (cursor === undefined || batch.length === 0) break;

    // Newest first: once a page reaches past the window start, everything
    // after it is older still.
    let oldest = Number.POSITIVE_INFINITY;
    for (const item of batch) {
      if (typeof item?.startedAt === "number" && item.startedAt < oldest) oldest = item.startedAt;
    }
    if (oldest < since) break;
  }

  if (pages >= maxPages && cursor !== undefined) truncated = true;
  return { items, truncated, retentionDays };
}

/**
 * Sum the rows that fall inside `[since, until]`.
 * @param {any[]} items
 * @param {number} since
 * @param {number} until
 */
export function summarizeRequestLogs(items, since, until) {
  let costUsd = 0;
  let requests = 0;
  let unpriced = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let reasoningTokens = 0;
  const outcomes = { succeeded: 0, failed: 0, cancelled: 0, rejected: 0 };
  /** @type {Map<string, {model: string, provider: string, requests: number, costUsd: number, tokens: number}>} */
  const byModel = new Map();
  /** @type {any[]} */
  const recent = [];

  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const startedAt = typeof item.startedAt === "number" ? item.startedAt : undefined;
    if (startedAt !== undefined && (startedAt < since || startedAt > until)) continue;

    requests++;
    const cost = typeof item.cost === "number" && Number.isFinite(item.cost) ? item.cost : undefined;
    if (cost === undefined) unpriced++;
    else costUsd += cost;

    const input = toCount(item.inputTokens);
    const output = toCount(item.outputTokens);
    const cacheRead = toCount(item.cacheReadTokens);
    const cacheWrite = toCount(item.cacheWriteTokens) + toCount(item.cacheWrite5mTokens) + toCount(item.cacheWrite1hTokens);
    const reasoning = toCount(item.reasoningTokens);
    inputTokens += input;
    outputTokens += output;
    cacheReadTokens += cacheRead;
    cacheWriteTokens += cacheWrite;
    reasoningTokens += reasoning;

    if (item.outcome === "succeeded" || item.outcome === "failed" || item.outcome === "cancelled" || item.outcome === "rejected") {
      outcomes[item.outcome] += 1;
    }

    const model = typeof item.model === "string" && item.model.length > 0 ? item.model : "unknown";
    const provider = typeof item.provider === "string" ? item.provider : "";
    const key = `${provider}\u0000${model}`;
    const row = byModel.get(key) ?? { model, provider, requests: 0, costUsd: 0, tokens: 0 };
    row.requests += 1;
    row.costUsd += cost ?? 0;
    row.tokens += input + output + cacheRead + cacheWrite;
    byModel.set(key, row);

    recent.push({
      id: typeof item.id === "string" ? item.id : undefined,
      startedAt,
      durationMs: toDuration(item),
      model,
      provider,
      outcome: typeof item.outcome === "string" ? item.outcome : "unknown",
      statusCode: typeof item.statusCode === "number" ? item.statusCode : undefined,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      costUsd: cost,
    });
  }

  recent.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

  return {
    totals: {
      costUsd: roundCost(costUsd),
      requests,
      unpriced,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens,
      tokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    },
    outcomes,
    models: [...byModel.values()]
      .map((row) => ({ ...row, costUsd: roundCost(row.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests),
    recent: recent.slice(0, RECENT_LIMIT),
  };
}

/**
 * One upstream status code and a short body excerpt.
 */
export class UpstreamError extends Error {
  /** @param {number} status @param {string} body */
  constructor(status, body) {
    super(`console request failed with ${status}${body ? `: ${body}` : ""}`);
    this.name = "UpstreamError";
    this.status = status;
    this.body = body;
  }
}

/** @param {unknown} value */
function toCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** @param {any} item */
function toDuration(item) {
  if (typeof item?.durationMs === "number" && Number.isFinite(item.durationMs)) return item.durationMs;
  if (typeof item?.startedAt === "number" && typeof item?.finishedAt === "number") {
    return Math.max(0, item.finishedAt - item.startedAt);
  }
  return undefined;
}

/** Keep summed float dollars from drifting into 0.30000000000000004. */
function roundCost(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** @param {Response} res */
async function readSnippet(res) {
  try {
    const text = await res.text();
    return text.replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Bucket requests by local hour, oldest first.
 * @param {any[]} items
 */
export function hourlyBuckets(items) {
  /** @type {Map<string, {hour: string, requests: number, tokens: number, costUsd: number}>} */
  const buckets = new Map();
  for (const item of items) {
    if (typeof item?.startedAt !== "number") continue;
    const date = new Date(item.startedAt);
    const key = `${String(date.getHours()).padStart(2, "0")}:00`;
    const row = buckets.get(key) ?? { hour: key, requests: 0, tokens: 0, costUsd: 0 };
    row.requests += 1;
    row.tokens += toCount(item.inputTokens) + toCount(item.outputTokens) + toCount(item.cacheReadTokens) + toCount(item.cacheWriteTokens);
    row.costUsd += typeof item.cost === "number" && Number.isFinite(item.cost) ? item.cost : 0;
    buckets.set(key, row);
  }
  return [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

/**
 * Render one session's numbers as an aligned plain-text benchmark snapshot.
 * @param {{
 *   session: {id: string, startedAt: number, until: number, durationMs: number},
 *   totals: any, outcomes: any, models: any[], recent: any[], hourly: any[],
 *   dsh?: any,
 *   meta: {savedAt: number, workspace?: string, credentialKind?: string, retentionDays?: number,
 *          truncated?: boolean, scanned?: number, outsideRetention?: boolean}
 * }} input
 */
export function renderSessionSnapshot({ session, totals, outcomes, models, recent, hourly, dsh, meta }) {
  const W = 20;
  const lines = [];
  const add = (text = "") => lines.push(text);
  const kv = (label, value) => add(`${label.padEnd(W)}${value}`);
  const title = "OpenCode Go — session cost snapshot";

  add(title);
  add("=".repeat(title.length));
  kv("saved at", stamp(meta.savedAt));
  kv("session", session.id);
  kv("window", `${stamp(session.startedAt)} → ${stamp(session.until)}`);
  kv("duration", duration(session.durationMs));
  if (meta.workspace) kv("workspace", meta.workspace);
  kv("source", "OpenCode console request log (category=inference)");
  kv("match", "time window, not session id");
  if (meta.credentialKind) kv("credential", meta.credentialKind);
  if (typeof meta.retentionDays === "number") {
    kv("logs kept", `${meta.retentionDays} days${meta.outsideRetention ? " (window starts before that)" : ""}`);
  }

  const hours = session.durationMs / 3_600_000;
  add("");
  add("Totals");
  add("------");
  kv("cost", dollars(totals.costUsd));
  kv("requests", String(totals.requests ?? 0));
  kv("tokens", tokens(totals.tokens));
  kv("  input", tokens(totals.inputTokens));
  kv("  output", tokens(totals.outputTokens));
  kv("  cache read", tokens(totals.cacheReadTokens));
  kv("  cache write", tokens(totals.cacheWriteTokens));
  kv("  reasoning", tokens(totals.reasoningTokens));
  kv("outcomes", ["succeeded", "failed", "cancelled", "rejected"]
    .map((key) => `${key} ${outcomes?.[key] ?? 0}`)
    .join(" · "));

  add("");
  add("Rates");
  add("-----");
  const requests = totals.requests ?? 0;
  kv("cost per request", requests > 0 ? dollars((totals.costUsd ?? 0) / requests) : "—");
  kv("tokens per request", requests > 0 ? tokens((totals.tokens ?? 0) / requests) : "—");
  kv("cost per hour", hours > 0 ? dollars((totals.costUsd ?? 0) / hours) : "—");
  kv("requests per hour", hours > 0 ? (requests / hours).toFixed(1) : "—");

  if (dsh !== undefined && dsh !== null) {
    add("");
    add("DSH session (host-side)");
    add("-----------------------");
    if (dsh.turns > 0) kv("turns", String(dsh.turns));
    if (dsh.steps > 0) kv("steps", String(dsh.steps));
    if (dsh.llmMs > 0) kv("llm time", duration(dsh.llmMs));
    if (dsh.toolMs > 0) kv("tool time", duration(dsh.toolMs));
    if (dsh.ttftSteps > 0 && dsh.ttftMs > 0) kv("ttft (avg)", seconds(dsh.ttftMs / dsh.ttftSteps));
    if (dsh.decodeMs > 0 && dsh.decodeTokens > 0) {
      kv("tokens/sec", String(Math.round(dsh.decodeTokens / (dsh.decodeMs / 1000))));
    }
    if (dsh.totalTokens > 0) {
      kv("tokens total", tokens(dsh.totalTokens));
      kv("  uncached input", tokens(dsh.uncachedInputTokens));
      kv("  cached input", tokens(dsh.cacheReadTokens));
      kv("  cache write", tokens(dsh.cacheWriteTokens));
      kv("  output", tokens(dsh.outputTokens));
    }
    if (typeof dsh.cacheHitRatio === "number") kv("cache hit", percent(dsh.cacheHitRatio));
    if (dsh.contextTokens > 0) {
      if (typeof dsh.contextWindow === "number" && dsh.contextWindow > 0) {
        kv("context", `${percent(dsh.contextTokens / dsh.contextWindow)} of ${tokens(dsh.contextWindow)} (${tokens(dsh.contextTokens)})`);
      } else {
        kv("context", tokens(dsh.contextTokens));
      }
      kv("  system prompt", tokens(dsh.systemTokens));
      kv("  tool definitions", tokens(dsh.toolsTokens));
      kv("  messages", tokens(dsh.messageTokens));
    }
  }

  add("");
  add("By model");
  add("--------");
  add(row(["model", "provider", "requests", "tokens", "cost"], [24, 12, 10, 12, 14], ["left", "left", "right", "right", "right"]));
  if (models.length === 0) add("  (none)");
  for (const model of models) {
    add(row([model.model, model.provider || "—", String(model.requests), tokens(model.tokens), dollars(model.costUsd)], [24, 12, 10, 12, 14], ["left", "left", "right", "right", "right"]));
  }

  add("");
  add("By hour (local)");
  add("---------------");
  add(row(["hour", "requests", "tokens", "cost"], [8, 10, 12, 14], ["left", "right", "right", "right"]));
  if (hourly.length === 0) add("  (none)");
  for (const bucket of hourly) {
    add(row([bucket.hour, String(bucket.requests), tokens(bucket.tokens), dollars(bucket.costUsd)], [8, 10, 12, 14], ["left", "right", "right", "right"]));
  }

  add("");
  add("Recent requests");
  add("---------------");
  add(row(["time", "duration", "tokens", "cost", "outcome"], [10, 10, 12, 14, 11], ["left", "right", "right", "right", "left"]));
  if (recent.length === 0) add("  (none)");
  for (const rowItem of recent) {
    add(row([
      clock(rowItem.startedAt),
      duration(rowItem.durationMs),
      tokens((rowItem.inputTokens ?? 0) + (rowItem.outputTokens ?? 0)),
      rowItem.costUsd === undefined ? "—" : dollars(rowItem.costUsd),
      rowItem.outcome,
    ], [10, 10, 12, 14, 11], ["left", "right", "right", "right", "left"]));
  }

  add("");
  add("Notes");
  add("-----");
  add("- cost is the console's own per-request USD value, summed over the window.");
  add("- rows are matched by time window, so other clients on the workspace count.");
  if (meta.truncated) add(`- only the newest ${meta.scanned ?? 0} requests were scanned; the total is partial.`);
  if ((totals.unpriced ?? 0) > 0) add(`- ${totals.unpriced} requests carried no cost and were counted but not summed.`);
  add("");
  return lines.join("\n");
}

/** Pad and align one table row. */
function row(cells, widths, aligns) {
  return cells
    .map((cell, index) => {
      const text = String(cell ?? "");
      const width = widths[index] ?? 12;
      return aligns[index] === "right" ? text.padStart(width) : text.padEnd(width);
    })
    .join("  ")
    .trimEnd();
}

/** `1.2s`, `4.2s`, `53.3s` — wall time small enough for a rate line. */
function seconds(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/** `99.5%` */
function percent(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

/** `20261028-072044-eb5c23ae.txt` — sorts by time, names the session. */
function snapshotFileName(sessionId, ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const shortId = String(sessionId).replace(/^session-/, "").slice(0, 8);
  return `${day}-${time}-${shortId}.txt`;
}

/** `2026-10-28 07:20:44 +08:00` in host local time. */
function stamp(ms) {  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const date = new Date(ms);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (value) => String(Math.abs(value)).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

/**
 * Strip a pasted `Cookie:`/`Authorization:` prefix and decide how the value is
 * sent: the console answers the browser's session both as a cookie header and
 * as a bearer token, so either pasted form is accepted.
 * @param {unknown} input
 * @returns {{ok: true, kind: 'cookie' | 'bearer', value: string} | {ok: false, message: string}}
 */
export function parseCredential(input) {
  if (typeof input !== "string") return { ok: false, message: "credential must be a string" };
  let value = input.trim();
  if (value.length === 0) return { ok: false, message: "credential is empty" };
  if (/[\r\n]/.test(value)) return { ok: false, message: "credential must be a single line" };
  if (value.length > MAX_COOKIE_BYTES) return { ok: false, message: "credential is too long" };

  value = value.replace(/^authorization\s*:\s*/i, "").trim();
  if (/^bearer\s+/i.test(value)) {
    const token = value.replace(/^bearer\s+/i, "").trim();
    if (token.length < 8) return { ok: false, message: "bearer token looks too short" };
    return { ok: true, kind: "bearer", value: token };
  }
  if (/^cookie\s*:/i.test(value)) {
    const cookie = value.replace(/^cookie\s*:\s*/i, "").trim();
    if (!cookie.includes("=")) return { ok: false, message: "cookie must look like name=value; name2=value2" };
    return { ok: true, kind: "cookie", value: cookie };
  }
  if (value.includes("=")) {
    return { ok: true, kind: "cookie", value };
  }
  if (value.length < 20) {
    return { ok: false, message: "expected 'Bearer …', 'Cookie: …', or name=value; name2=value2" };
  }
  return { ok: true, kind: "bearer", value };
}

/**
 * Accept a bare `wrk_…`/`org_…` id or a full console URL and keep the id.
 * @param {unknown} input
 * @returns {{ok: true, value: string} | {ok: false, message: string}}
 */
export function parseWorkspace(input) {
  if (typeof input !== "string") return { ok: false, message: "workspace must be a string" };
  if (/[\r\n]/.test(input)) return { ok: false, message: "workspace must be a single line" };
  const match = input.match(/\b((?:wrk|org)_[A-Za-z0-9]+)\b/);
  if (match === null) return { ok: false, message: "workspace must contain a wrk_… or org_… id" };
  return { ok: true, value: match[1] };
}

/**
 * Request headers for one console auth form.
 * @param {ConsoleAuth} auth
 */
function authHeaders(auth) {
  return auth.kind === "bearer" ? { authorization: `Bearer ${auth.value}` } : { cookie: auth.value };
}

/**
 * First workspace id in a console `/orgs` payload, without assuming its shape.
 * @param {any} body
 */
function firstWorkspaceId(body) {
  const lists = [
    body?.items,
    body?.orgs,
    body?.organizations,
    body?.workspaces,
    body?.data,
    Array.isArray(body) ? body : undefined,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const id = entry?.id ?? entry?.workspaceID ?? entry?.workspaceId ?? entry?.org_id;
      if (typeof id === "string" && /^(?:wrk|org)_/.test(id)) return id;
    }
  }
  return undefined;
}

/**
 * @param {import('@deepseek-ai/cordis').Context & any} ctx
 * @param {Record<string, any>} [config]
 */
export function apply(ctx, config = {}) {
  const settings = {
    credentialRef: typeof config.credentialRef === "string" && config.credentialRef.length > 0
      ? config.credentialRef
      : DEFAULT_CREDENTIAL_REF,
    apiBase: typeof config.apiBase === "string" && config.apiBase.length > 0 ? config.apiBase : DEFAULT_API_BASE,
    cacheMs: Number.isFinite(config.cacheMs) && config.cacheMs >= 0 ? config.cacheMs : DEFAULT_CACHE_MS,
    maxPages: Number.isFinite(config.maxPages) && config.maxPages > 0 ? Math.floor(config.maxPages) : DEFAULT_MAX_PAGES,
    routePrefix: typeof config.routePrefix === "string" && config.routePrefix.startsWith("/")
      ? config.routePrefix.replace(/\/+$/, "")
      : "/opencode-go",
    orgId: (() => {
      if (typeof config.orgId !== "string" || config.orgId.length === 0) return "";
      const parsed = parseWorkspace(config.orgId);
      return parsed.ok === true ? parsed.value : "";
    })(),
  };

  /** @param {string | undefined} sessionId */
  const resolveSession = (sessionId) => sessionId !== undefined
    ? { id: sessionId, startedAt: sessionStartOf(sessionId) }
    : newestRootSession();

  /**
   * Host-side session figures behind the shell's own popovers: turn/step wall
   * times, provider-reported token totals, and context composition. Every field
   * is optional — a profile without the projection rows simply omits them.
   * @param {string} sessionId
   */
  const readSessionMetrics = (sessionId) => {
    try {
      const session = ctx.agents?.get?.(sessionId)?.session;
      if (session === undefined) return undefined;
      const projections = typeof ctx.get === "function" ? ctx.get("sessionProjections") : undefined;

      /** @param {string} key */
      const stateOf = (key) => {
        try {
          return projections?.stateOf?.(session, key);
        } catch {
          return undefined;
        }
      };

      const stats = stateOf("sessionStats");
      const usage = stateOf("tokenUsage");
      const breakdown = stateOf("contextBreakdown");
      const pressure = stateOf("contextPressure");

      const totals = usage?.totals ?? (usage && typeof usage === "object" && "uncachedInputTokens" in usage ? usage : undefined);
      const uncachedInputTokens = toCount(totals?.uncachedInputTokens);
      const cacheReadTokens = toCount(totals?.cacheReadTokens);
      const cacheWriteTokens = toCount(totals?.cacheWriteTokens);
      const output = toCount(totals?.outputTokens);

      const promptTokens = uncachedInputTokens + cacheReadTokens;
      return {
        turns: toCount(stats?.turns),
        steps: toCount(stats?.steps),
        llmMs: toCount(stats?.llmMs),
        toolMs: toCount(stats?.toolMs),
        ttftMs: toCount(stats?.ttftMs),
        ttftSteps: toCount(stats?.ttftSteps),
        decodeMs: toCount(stats?.decodeMs),
        decodeTokens: toCount(stats?.decodeTokens),
        uncachedInputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTokens: output,
        totalTokens: uncachedInputTokens + cacheReadTokens + cacheWriteTokens + output,
        cacheHitRatio: promptTokens > 0 ? cacheReadTokens / promptTokens : undefined,
        contextWindow: typeof pressure?.contextWindow === "number" ? pressure.contextWindow : undefined,
        contextTokens: toCount(pressure?.pressureTokens ?? pressure?.surfaceTokens),
        systemTokens: toCount(breakdown?.breakdown?.systemTokens),
        toolsTokens: toCount(breakdown?.breakdown?.toolsTokens),
        messageTokens: toCount(breakdown?.breakdown?.messageTokens),
      };
    } catch {
      return undefined;
    }
  };

  /** @param {string} sessionId */
  const sessionStartOf = (sessionId) => {
    try {
      const agent = ctx.agents?.get?.(sessionId);
      const createdAt = agent?.session?.header?.createdAt;
      return typeof createdAt === "number" ? createdAt : undefined;
    } catch {
      return undefined;
    }
  };

  /** Newest live root session, used when the browser cannot name one. */
  const newestRootSession = () => {
    let best;
    try {
      const roots = typeof ctx.agents?.roots === "function" ? ctx.agents.roots() : [];
      for (const agent of roots) {
        const createdAt = agent?.session?.header?.createdAt;
        if (typeof createdAt !== "number") continue;
        if (best === undefined || createdAt > best.startedAt) best = { id: String(agent.id), startedAt: createdAt };
      }
    } catch {
      // no live agents
    }
    return best;
  };

  const resolveCredential = async () => {
    try {
      const hit = await ctx.credentials.resolve(settings.credentialRef);
      if (typeof hit?.value !== "string" || hit.value.length === 0) return undefined;
      const parsed = parseCredential(hit.value);
      return parsed.ok === true ? parsed : undefined;
    } catch {
      return undefined;
    }
  };

  const resolveStoredWorkspace = async () => {
    try {
      const hit = await ctx.credentials.resolve(WORKSPACE_REF);
      if (typeof hit?.value !== "string" || hit.value.length === 0) return undefined;
      const parsed = parseWorkspace(hit.value);
      return parsed.ok === true ? parsed.value : undefined;
    } catch {
      return undefined;
    }
  };

  /** @type {string | undefined} */
  let discoveredWorkspace;
  /**
   * Ask the console which workspace this session belongs to. A rejected session
   * is reported here so the caller can say "expired" instead of "no workspace".
   * @param {ConsoleAuth} auth
   */
  const discoverWorkspace = async (auth) => {
    if (discoveredWorkspace !== undefined) return { id: discoveredWorkspace };
    try {
      const res = await fetch(`${settings.apiBase.replace(/\/+$/, "")}/console/api/orgs`, {
        headers: { accept: "application/json", ...authHeaders(auth) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) return { unauthorized: true };
      if (!res.ok) return {};
      const id = firstWorkspaceId(await res.json());
      if (id !== undefined) discoveredWorkspace = id;
      return id !== undefined ? { id } : {};
    } catch {
      return {};
    }
  };

  /** @param {ConsoleAuth} auth */
  const workspaceOf = async (auth) => {
    if (settings.orgId.length > 0) return { id: settings.orgId };
    const stored = await resolveStoredWorkspace();
    if (stored !== undefined) return { id: stored };
    return discoverWorkspace(auth);
  };

  /** @type {Map<string, {at: number, promise: Promise<any>}>} */
  const cache = new Map();

  /** @param {string | undefined} sessionId @param {boolean} refresh */
  const summaryOf = (sessionId, refresh) => {
    const key = sessionId ?? "\u0000newest";
    const now = Date.now();
    const hit = cache.get(key);
    if (refresh !== true && hit !== undefined && now - hit.at < settings.cacheMs) return hit.promise;

    const promise = computeSummary(sessionId);
    cache.set(key, { at: now, promise });
    promise.catch(() => {
      const current = cache.get(key);
      if (current !== undefined && current.promise === promise) cache.delete(key);
    });
    if (cache.size > 64) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest !== undefined) cache.delete(oldest[0]);
    }
    return promise;
  };

  /** @param {string | undefined} sessionId */
  const computeSummary = async (sessionId) => {
    const resolved = resolveSession(sessionId);
    if (resolved === undefined || resolved.startedAt === undefined) {
      return {
        ok: false,
        code: "no-session",
        message: sessionId === undefined
          ? "no live session to measure"
          : `session ${sessionId} is not live in this process`,
      };
    }

    const until = Date.now();
    const session = {
      id: resolved.id,
      startedAt: resolved.startedAt,
      until,
      durationMs: Math.max(0, until - resolved.startedAt),
    };

    const auth = await resolveCredential();
    if (auth === undefined) {
      return {
        ok: false,
        code: "no-credential",
        message: `no console session in credential ${settings.credentialRef}`,
        session,
        credential: { ref: settings.credentialRef, configured: false, workspace: undefined },
        consoleUrl: `${settings.apiBase.replace(/\/+$/, "")}/console`,
      };
    }
    const workspace = await workspaceOf(auth);
    if (workspace.unauthorized === true) {
      return {
        ok: false,
        code: "unauthorized",
        message: "the console rejected this session while resolving its workspace",
        session,
        credential: { ref: settings.credentialRef, configured: true, kind: auth.kind, workspace: undefined },
        consoleUrl: `${settings.apiBase.replace(/\/+$/, "")}/console`,
      };
    }
    const orgId = workspace.id;

    try {
      const { items, truncated, retentionDays } = await fetchRequestLogs({
        base: settings.apiBase,
        auth,
        orgId,
        since: session.startedAt,
        until,
        maxPages: settings.maxPages,
      });
      const summary = summarizeRequestLogs(items, session.startedAt, until);
      return {
        ok: true,
        code: "ok",
        source: "console",
        session,
        credential: { ref: settings.credentialRef, configured: true, kind: auth.kind, workspace: orgId },
        consoleUrl: `${settings.apiBase.replace(/\/+$/, "")}/console`,
        scanned: items.length,
        truncated,
        retentionDays,
        outsideRetention:
          typeof retentionDays === "number" && session.durationMs > retentionDays * 86_400_000,
        fetchedAt: Date.now(),
        ...summary,
      };
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : undefined;
      const body = error instanceof UpstreamError ? error.body : "";
      const orgRequired = status === 400 && /OrgRequired|org_required|x-org-id/i.test(body);
      const code = orgRequired
        ? "org-required"
        : status === 400
          ? "bad-request"
          : status === 401
            ? "unauthorized"
            : status === 403
              ? "forbidden"
              : status === 404
                ? "not-found"
                : status === 429
                  ? "rate-limited"
                  : "upstream";
      return {
        ok: false,
        code,
        message: error instanceof Error ? error.message : String(error),
        session,
        credential: { ref: settings.credentialRef, configured: true, kind: auth.kind, workspace: orgId },
        consoleUrl: `${settings.apiBase.replace(/\/+$/, "")}/console`,
      };
    }
  };

  const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(payload));
  };

  /**
   * These routes are reachable without the shell's connection credential, so a
   * page on another origin must not be able to write: a state-changing request
   * has to come from this origin.
   */
  const rejectCrossOrigin = (req, res) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (typeof origin === "string" && origin.length > 0 && typeof host === "string" && host.length > 0) {
      if (origin !== `http://${host}`) {
        sendJson(res, 403, { ok: false, code: "forbidden-origin", message: "cross-origin write rejected" });
        return true;
      }
    }
    return false;
  };

  const rejectNonJson = (req, res) => {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().startsWith("application/json")) {
      sendJson(res, 415, { ok: false, code: "unsupported-media-type", message: "expected application/json" });
      return true;
    }
    return false;
  };

  /**
   * Write one session's numbers to a plain-text snapshot inside `dir`, the
   * folder the user picked in the native dialog.
   * @param {string | undefined} sessionId
   * @param {string} dir
   */
  const exportSession = async (sessionId, dir) => {
    if (typeof dir !== "string" || dir.trim().length === 0) {
      return { ok: false, code: "no-directory", message: "no folder was chosen" };
    }
    if (!isAbsolute(dir.trim())) {
      return { ok: false, code: "bad-request", message: "folder must be an absolute path" };
    }
    const resolved = resolveSession(sessionId);
    if (resolved === undefined || resolved.startedAt === undefined) {
      return {
        ok: false,
        code: "no-session",
        message: sessionId === undefined ? "no live session to export" : `session ${sessionId} is not live in this process`,
      };
    }

    const until = Date.now();
    const auth = await resolveCredential();
    if (auth === undefined) {
      return { ok: false, code: "no-credential", message: `no console session in credential ${settings.credentialRef}` };
    }

    const workspace = await workspaceOf(auth);
    if (workspace.unauthorized === true) {
      return { ok: false, code: "unauthorized", message: "the console rejected this session while resolving its workspace" };
    }

    try {
      const { items, truncated, retentionDays } = await fetchRequestLogs({
        base: settings.apiBase,
        auth,
        orgId: workspace.id,
        since: resolved.startedAt,
        until,
        maxPages: settings.maxPages,
      });
      const summary = summarizeRequestLogs(items, resolved.startedAt, until);
      const session = { id: resolved.id, startedAt: resolved.startedAt, until, durationMs: until - resolved.startedAt };
      const text = renderSessionSnapshot({
        session,
        totals: summary.totals,
        outcomes: summary.outcomes,
        models: summary.models,
        recent: summary.recent.slice(0, 10),
        hourly: hourlyBuckets(items),
        dsh: readSessionMetrics(resolved.id),
        meta: {
          savedAt: Date.now(),
          workspace: workspace.id,
          credentialKind: auth.kind,
          retentionDays,
          truncated,
          scanned: items.length,
          outsideRetention: typeof retentionDays === "number" && session.durationMs > retentionDays * 86_400_000,
        },
      });

      const dir0 = dir.trim();
      await mkdir(dir0, { recursive: true });
      const path = join(dir0, snapshotFileName(session.id, Date.now()));
      await writeFile(path, text, "utf8");
      return {
        ok: true,
        path,
        dir: dir0,
        bytes: Buffer.byteLength(text, "utf8"),
        session,
        totals: summary.totals,
        requests: summary.totals.requests,
      };
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : undefined;
      const body = error instanceof UpstreamError ? error.body : "";
      const code = status === 400 && /OrgRequired|org_required|x-org-id/i.test(body)
        ? "org-required"
        : status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 429
              ? "rate-limited"
              : "upstream";
      return { ok: false, code, message: error instanceof Error ? error.message : String(error) };
    }
  };

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  const handleExport = async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    if (rejectNonJson(req, res)) return;
    try {
      const raw = await readBody(req, 8192);
      let body = {};
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, code: "bad-request", message: "body must be JSON" });
        return;
      }
      const sessionId = typeof body?.session === "string" && body.session.length > 0 ? body.session : undefined;
      const dir = typeof body?.dir === "string" && body.dir.length > 0 ? body.dir : undefined;
      sendJson(res, 200, await exportSession(sessionId, dir));
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  const handleSummary = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const sessionId = url.searchParams.get("session") ?? undefined;
    const refresh = url.searchParams.get("refresh") === "1";
    try {
      const payload = await summaryOf(sessionId, refresh);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  const handleCookie = async (req, res) => {
    try {
      if (rejectCrossOrigin(req, res)) return;
      if (req.method === "POST" && rejectNonJson(req, res)) return;

      if (req.method === "DELETE") {
        await ctx.credentials.unset(settings.credentialRef);
        await ctx.credentials.unset(WORKSPACE_REF);
        discoveredWorkspace = undefined;
        cache.clear();
        sendJson(res, 200, { ok: true, cleared: true });
        return;
      }

      const raw = await readBody(req, MAX_COOKIE_BYTES * 2);
      let body;
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, code: "bad-request", message: "body must be JSON" });
        return;
      }

      const saved = [];
      if (body?.credential !== undefined) {
        const parsed = parseCredential(body.credential);
        if (parsed.ok !== true) {
          sendJson(res, 400, { ok: false, code: "bad-request", message: parsed.message });
          return;
        }
        await ctx.credentials.set(settings.credentialRef, parsed.value);
        saved.push("credential");
      }

      if (body?.workspace !== undefined) {
        const text = String(body.workspace ?? "").trim();
        if (text.length === 0) {
          await ctx.credentials.unset(WORKSPACE_REF);
          saved.push("workspace-cleared");
        } else {
          const parsed = parseWorkspace(text);
          if (parsed.ok !== true) {
            sendJson(res, 400, { ok: false, code: "bad-request", message: parsed.message });
            return;
          }
          await ctx.credentials.set(WORKSPACE_REF, parsed.value);
          saved.push("workspace");
        }
      }

      if (saved.length === 0) {
        sendJson(res, 400, { ok: false, code: "bad-request", message: "nothing to save" });
        return;
      }

      discoveredWorkspace = undefined;
      cache.clear();
      sendJson(res, 200, { ok: true, saved, ref: settings.credentialRef });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        code: "internal",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: `${settings.routePrefix}/session-cost`, handler: handleSummary }),
    "opencode-go-session-cost: cost route",
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: `${settings.routePrefix}/session-cookie`, handler: handleCookie }),
    "opencode-go-session-cost: cookie route",
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: `${settings.routePrefix}/session-export`, handler: handleExport }),
    "opencode-go-session-cost: export route",
  );

  // `/opencode-go` — the same numbers as text, for answering "what did this
  // session cost?" without leaving the conversation.
  ctx.effect(
    () => ctx.commands.register({
      name: "opencode-go",
      description: "show what this session cost on the OpenCode Go subscription",
      handler: async (invocation) => {
        const sessionId = invocation?.agent?.id !== undefined ? String(invocation.agent.id) : undefined;
        const payload = await summaryOf(sessionId, true);
        return { kind: payload.ok === true ? "success" : "error", text: renderSummaryText(payload) };
      },
    }),
    "opencode-go-session-cost: command",
  );
}

/**
 * Plain-text rendering of one summary payload, used by the `/opencode-go` command.
 * @param {any} payload
 */
export function renderSummaryText(payload) {
  if (payload === null || payload === undefined) return "OpenCode Go: no data.";
  if (payload.ok !== true) {
    const hints = {
      "no-credential": `No console session yet. Paste one in the session-cost tab, or set credential ${DEFAULT_CREDENTIAL_REF}.`,
      unauthorized: "The console rejected the stored session (it probably expired). Open the session-cost tab and paste a fresh one.",
      forbidden: "This account cannot read request logs in that workspace.",
      "org-required": "The console needs a workspace id. Paste it in the session-cost tab (the wrk_… part of your console URL).",
      "rate-limited": "The console is rate limiting this machine; try again shortly.",
      "no-session": "This session is not live in the host process, so it has no start time to measure.",
    };
    const hint = hints[payload.code];
    return `OpenCode Go: ${hint ?? payload.message ?? "unavailable"}`;
  }

  const session = payload.session ?? {};
  const totals = payload.totals ?? {};
  const lines = [
    `OpenCode Go · session cost ${dollars(totals.costUsd)}`,
    `Window  ${clock(session.startedAt)} → now (${duration(session.durationMs)})`,
    `Requests ${totals.requests ?? 0} · ${tokens(totals.tokens)} tokens (in ${tokens(totals.inputTokens)}, out ${tokens(totals.outputTokens)}, cache read ${tokens(totals.cacheReadTokens)})`,
  ];

  const models = Array.isArray(payload.models) ? payload.models.slice(0, 4) : [];
  if (models.length > 0) {
    lines.push("By model");
    for (const row of models) {
      lines.push(`  ${row.model}  ${dollars(row.costUsd)}  ${row.requests} req  ${tokens(row.tokens)} tok`);
    }
  }

  const recent = Array.isArray(payload.recent) ? payload.recent.slice(0, 3) : [];
  if (recent.length > 0) {
    lines.push("Recent");
    for (const row of recent) {
      lines.push(`  ${clock(row.startedAt)}  ${row.model}  ${duration(row.durationMs)}  ${dollars(row.costUsd)}  ${row.outcome}`);
    }
  }

  if (typeof payload.retentionDays === "number") {
    lines.push(`Logs are kept for ${payload.retentionDays} days; rows are matched by time window.`);
  }
  return lines.join("\n");
}

/** @param {number} value */
function dollars(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  return `$${value.toFixed(value >= 0.01 ? 4 : 6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

/** @param {number} value */
function tokens(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

/** @param {number} ms */
function duration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** @param {number} ts */
function clock(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "—";
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

/**
 * Read a bounded request body.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 */
async function readBody(req, limit) {
  let size = 0;
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > limit) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
