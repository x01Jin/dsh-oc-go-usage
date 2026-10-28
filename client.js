// dsh-opencode-go-session-cost — browser half.
//
// Hand-authored client bundle in the DSH module-loader factory format. It adds
// one tab to the Session header's view row (`conversation.view`, beside Chat and
// Trajectory) that reports what this Session costs on the OpenCode Go
// subscription. The tab reads the same-origin route the host half owns, so the
// console cookie never enters the page.
window.__ModuleLoader__.load({
  id: "dsh-opencode-go-session-cost",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const NS = "opencode-go-session-cost";
    const ROUTE = "/opencode-go/session-cost";
    const COOKIE_ROUTE = "/opencode-go/session-cookie";
    const EXPORT_ROUTE = "/opencode-go/session-export";
    const POLL_MS = 30_000;

    const CSS_ID = "dsh-opencode-go-session-cost/usage.css";
    const CSS = "div:has(>.ocgsc-view){display:flex;flex-direction:column;flex:1 1 0;min-height:0;overflow:hidden}.ocgsc-view{display:flex;flex-direction:column;flex:1 1 0;box-sizing:border-box;width:100%;min-height:0;overflow:hidden;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left}.ocgsc-scroll{flex:1 1 0;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:16px;width:100%;max-width:1100px;margin:0 auto;padding:24px 32px 176px;box-sizing:border-box}.ocgsc-viewhead{display:flex;align-items:flex-start;gap:16px;justify-content:space-between;flex-wrap:wrap}.ocgsc-viewtitle{margin:0;font-size:18px;line-height:26px;font-weight:600;letter-spacing:-.01em}.ocgsc-viewsub{margin:2px 0 0;max-width:62ch;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.ocgsc-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);gap:16px;align-items:start}.ocgsc-wide{grid-column:1/-1}.ocgsc-hero{font-size:30px;line-height:36px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}@media (max-width:860px){.ocgsc-scroll{padding:20px 16px 168px}.ocgsc-grid{grid-template-columns:minmax(0,1fr)}}.ocgsc-card{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:14px 16px;border-radius:12px;border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1));min-width:0}.ocgsc-card-head{display:flex;align-items:center;gap:8px;min-width:0}.ocgsc-card-title{font-weight:600;font-size:13px;white-space:nowrap}.ocgsc-spacer{flex:1 1 auto;min-width:0}.ocgsc-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}.ocgsc-dot[data-state=\"warn\"]{background:var(--dsw-alias-state-warn-primary)}.ocgsc-dot[data-state=\"error\"]{background:var(--dsw-alias-state-error-primary)}.ocgsc-dot[data-state=\"idle\"]{background:var(--dsw-alias-state-idle-primary)}.ocgsc-status{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.ocgsc-row{display:flex;flex-direction:column;gap:6px;min-width:0}.ocgsc-row-label{display:flex;align-items:baseline;gap:8px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary)}.ocgsc-row-hint{font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11px}.ocgsc-input{font:inherit;font-size:12px;line-height:20px;padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);width:100%;min-width:0;box-sizing:border-box}.ocgsc-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}.ocgsc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ocgsc-btn{font:inherit;font-size:12px;line-height:24px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}.ocgsc-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.ocgsc-btn[data-variant=\"primary\"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}.ocgsc-btn[data-variant=\"primary\"]:hover{background:var(--dsw-alias-button-primary-hover)}.ocgsc-btn:disabled{opacity:.5;cursor:default}.ocgsc-msg{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0}.ocgsc-msg[data-tone=\"error\"]{color:var(--dsw-alias-state-error-primary)}.ocgsc-msg[data-tone=\"ok\"]{color:var(--dsw-alias-state-success-primary)}.ocgsc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:12px}.ocgsc-stat{display:flex;flex-direction:column;gap:2px;min-width:0}.ocgsc-stat-label{color:var(--dsw-alias-label-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.04em}.ocgsc-stat-value{font-variant-numeric:tabular-nums;font-weight:600;font-size:15px;line-height:22px}.ocgsc-gridrow{display:grid;grid-template-columns:minmax(0,1fr) 64px 80px 88px;gap:10px;align-items:center;font-size:12px;padding:3px 0;border-top:1px solid var(--dsw-alias-border-l1)}.ocgsc-gridrow:first-of-type{border-top:none}.ocgsc-gridrow>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ocgsc-gridrow>span:nth-child(n+2){text-align:right;font-variant-numeric:tabular-nums}.ocgsc-gridhead{color:var(--dsw-alias-label-secondary);font-size:10px;text-transform:uppercase;letter-spacing:.04em;border-top:none}.ocgsc-outcome{font-weight:600}.ocgsc-outcome[data-outcome=\"failed\"],.ocgsc-outcome[data-outcome=\"rejected\"]{color:var(--dsw-alias-state-error-primary)}.ocgsc-outcome[data-outcome=\"cancelled\"]{color:var(--dsw-alias-state-warn-primary)}.ocgsc-note{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px}.ocgsc-path{font-size:11px;line-height:17px;word-break:break-all;color:var(--dsw-alias-label-secondary)}.ocgsc-path[data-tone=\"ok\"]{color:var(--dsw-alias-state-success-primary)}.ocgsc-path[data-tone=\"error\"]{color:var(--dsw-alias-state-error-primary)}.ocgsc-empty{color:var(--dsw-alias-label-secondary);font-size:12px}body.ocgsc-fullpage [class*='composerSeat']{display:none!important}";

    const en = {
  "page.tab": "Opencode Go",
  "page.title": "Session cost",
  "page.lede": "What this session costs on the OpenCode Go subscription, summed from the OpenCode console request log for the session's own time window.",
  "conn.title": "Console session",
  "conn.connected": "Connected",
  "conn.workspace": "Workspace",
  "conn.discovered": "workspace discovered",
  "conn.missing": "Not connected",
  "conn.expired": "Session expired",
  "conn.forbidden": "No log access",
  "conn.needsWorkspace": "Workspace required",
  "conn.error": "Unavailable",
  "conn.credential": "Console session",
  "conn.credentialHint": "Cookie header or Authorization: Bearer … from a request-logs request in opencode.ai/console.",
  "conn.credentialPlaceholder": "name=value; name2=value2 — or Bearer …",
  "conn.workspaceHint": "Optional. The wrk_… id from your console URL; discovered automatically when the console allows it.",
  "conn.workspacePlaceholder": "wrk_… or https://opencode.ai/console/wrk_…",
  "conn.save": "Save",
  "conn.disconnect": "Disconnect",
  "conn.saved": "Saved.",
  "conn.cleared": "Disconnected.",
  "conn.saving": "Saving…",
  "session.title": "This session",
  "session.window": "{start} → now · {duration}",
  "session.newest": "Newest live session ({id}).",
  "session.refresh": "Refresh",
  "session.export": "Save .txt",
  "session.exporting": "Saving…",
  "session.exported": "Saved to {path} ({size})",
  "session.exportFailed": "Could not save: {message}",
    "session.exportCancelled": "No folder was chosen, so nothing was saved.",
  "session.total": "Total cost",
  "session.requests": "Requests",
  "session.tokens": "Tokens",
  "session.input": "Input",
  "session.output": "Output",
  "session.cacheRead": "Cache read",
  "session.cacheWrite": "Cache write",
  "session.models": "By model",
  "session.recent": "Recent requests",
  "session.none": "No requests in this window yet.",
  "session.nodata": "No data.",
  "table.model": "Model",
  "table.req": "Req",
  "table.tokens": "Tokens",
  "table.cost": "Cost",
  "table.time": "Time",
  "table.duration": "Took",
  "hint.window": "Rows are matched by time window, not by a session id, so other clients on the same workspace are included.",
  "hint.retention": "The console keeps request logs for {days} days.",
  "hint.truncated": "Only the newest {n} requests were scanned.",
  "hint.unpriced": "{n} requests carried no cost.",
  "error.noCredential": "No console session yet. Paste one above to read the request log.",
  "error.unauthorized": "The console rejected this session. It probably expired — paste a fresh one.",
  "error.forbidden": "This account cannot read request logs in that workspace.",
  "error.workspace": "The console needs a workspace id. Paste the wrk_… part of your console URL above.",
  "error.rateLimited": "The console is rate limiting this machine. Try again shortly.",
  "error.upstream": "Console request failed: {message}",
  "error.noSession": "This session is not live in the host process, so it has no start time to measure.",
  "error.generic": "Unavailable: {message}"
};

    const zh = {
  "page.tab": "Opencode Go",
  "page.title": "会话花费",
  "page.lede": "按会话自身的时间窗,从 OpenCode 控制台请求日志汇总本次会话在 OpenCode Go 订阅上的花费。",
  "conn.title": "控制台会话",
  "conn.connected": "已连接",
  "conn.workspace": "工作区",
  "conn.discovered": "已自动发现工作区",
  "conn.missing": "未连接",
  "conn.expired": "会话已过期",
  "conn.forbidden": "无日志权限",
  "conn.needsWorkspace": "需要工作区",
  "conn.error": "不可用",
  "conn.credential": "控制台会话",
  "conn.credentialHint": "在 opencode.ai/console 中抓取 request-logs 请求的 Cookie 头或 Authorization: Bearer …。",
  "conn.credentialPlaceholder": "name=value; name2=value2 —— 或 Bearer …",
  "conn.workspaceHint": "可选。控制台网址中的 wrk_… 标识;控制台允许时会自动发现。",
  "conn.workspacePlaceholder": "wrk_… 或 https://opencode.ai/console/wrk_…",
  "conn.save": "保存",
  "conn.disconnect": "断开",
  "conn.saved": "已保存。",
  "conn.cleared": "已断开。",
  "conn.saving": "保存中…",
  "session.title": "本次会话",
  "session.window": "{start} → 现在 · {duration}",
  "session.newest": "最新的活动会话({id})。",
  "session.refresh": "刷新",
  "session.export": "保存 .txt",
  "session.exporting": "保存中…",
  "session.exported": "已保存到 {path}({size})",
  "session.exportFailed": "保存失败:{message}",
    "session.exportCancelled": "没有选择文件夹,未保存。",
  "session.total": "总花费",
  "session.requests": "请求数",
  "session.tokens": "Token",
  "session.input": "输入",
  "session.output": "输出",
  "session.cacheRead": "缓存读取",
  "session.cacheWrite": "缓存写入",
  "session.models": "按模型",
  "session.recent": "最近请求",
  "session.none": "该时间窗内暂无请求。",
  "session.nodata": "无数据。",
  "table.model": "模型",
  "table.req": "次数",
  "table.tokens": "Token",
  "table.cost": "花费",
  "table.time": "时间",
  "table.duration": "耗时",
  "hint.window": "按时间窗匹配日志,而非会话 ID,因此同一工作区的其他客户端也会计入。",
  "hint.retention": "控制台仅保留 {days} 天请求日志。",
  "hint.truncated": "仅扫描了最新的 {n} 条请求。",
  "hint.unpriced": "{n} 条请求没有费用数据。",
  "error.noCredential": "尚未连接控制台会话,在上方粘贴后即可读取请求日志。",
  "error.unauthorized": "控制台拒绝了该会话,多半已过期,请粘贴新的。",
  "error.forbidden": "该账号无此工作区的请求日志权限。",
  "error.workspace": "控制台需要一个工作区标识,请把控制台网址中的 wrk_… 填到上方。",
  "error.rateLimited": "控制台正在限流,请稍后重试。",
  "error.upstream": "控制台请求失败:{message}",
  "error.noSession": "该会话未在当前进程中运行,无法确定起始时间。",
  "error.generic": "不可用:{message}"
};

    function formatUsd(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "—";
      return `$${value.toFixed(4)}`;
    }

    function formatCount(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "—";
      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
      return String(Math.round(value));
    }

    function formatDuration(ms) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
      if (ms < 1_000) return `${Math.round(ms)} ms`;
      if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
      const minutes = Math.floor(ms / 60_000);
      const seconds = Math.round((ms % 60_000) / 1_000);
      return `${minutes}m ${seconds}s`;
    }

    function formatAge(ms) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
      if (ms < 5_000) return "just now";
      if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
      const minutes = Math.floor(ms / 60_000);
      if (minutes < 60) return `${minutes}m`;
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }

    function formatClock(ts) {
      if (typeof ts !== "number" || !Number.isFinite(ts)) return "—";
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function formatBytes(bytes) {
      if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${Math.round(bytes)} B`;
    }

    async function fetchSummary(sessionId) {
      const url = typeof sessionId === "string" && sessionId.length > 0
        ? `${ROUTE}?session=${encodeURIComponent(sessionId)}`
        : ROUTE;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json === null) throw new Error(`HTTP ${res.status}`);
      return json;
    }

    function noticeText(payload, t) {
      switch (payload && payload.code) {
        case "no-credential":
          return t("error.noCredential");
        case "unauthorized":
          return t("error.unauthorized");
        case "forbidden":
          return t("error.forbidden");
        case "org-required":
          return t("error.workspace");
        case "rate-limited":
          return t("error.rateLimited");
        case "no-session":
          return t("error.noSession");
        default:
          return t("error.upstream", { message: (payload && payload.message) || "" });
      }
    }

    function connectionState(payload) {
      if (payload === null || payload === undefined) return { tone: "idle", key: "conn.missing" };
      if (payload.ok === true) return { tone: "ok", key: "conn.connected" };
      switch (payload.code) {
        case "unauthorized":
          return { tone: "error", key: "conn.expired" };
        case "forbidden":
          return { tone: "error", key: "conn.forbidden" };
        case "org-required":
          return { tone: "warn", key: "conn.needsWorkspace" };
        case "no-credential":
          return { tone: "idle", key: "conn.missing" };
        case "no-session":
          return { tone: "idle", key: "conn.missing" };
        default:
          return { tone: "error", key: "conn.error" };
      }
    }

    function stat(label, value) {
      return h("div", { className: "ocgsc-stat", key: label },
        h("span", { className: "ocgsc-stat-label" }, label),
        h("span", { className: "ocgsc-stat-value" }, value));
    }

    function gridRow(cells, key, extraClass) {
      return h("div", {
        className: extraClass ? `ocgsc-gridrow ${extraClass}` : "ocgsc-gridrow",
        key,
      }, cells.map((cell, index) => h("span", { key: index }, cell)));
    }

    function createPage(t, ctx) {
      return function OpenCodeGoUsage({ sessionId }) {
        const [payload, setPayload] = React.useState(null);
        const [stamp, setStamp] = React.useState(0);
        const [draft, setDraft] = React.useState("");
        const [workspaceDraft, setWorkspaceDraft] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        const [message, setMessage] = React.useState(null);
        const [exporting, setExporting] = React.useState(false);
        const [exportMessage, setExportMessage] = React.useState(null);
        const [now, setNow] = React.useState(() => Date.now());

        React.useEffect(() => {
          let alive = true;
          const load = async () => {
            try {
              const json = await fetchSummary(sessionId);
              if (alive) setPayload(json);
            } catch (error) {
              if (alive) {
                setPayload({ ok: false, code: "internal", message: error && error.message ? error.message : String(error) });
              }
            }
          };
          load();
          const timer = window.setInterval(load, POLL_MS);
          return () => {
            alive = false;
            window.clearInterval(timer);
          };
        }, [stamp, sessionId]);


        // This view owns the whole pane: hide the shell's composer while it is mounted
        // and hand it back on unmount, so other tabs keep their input box.
        React.useEffect(() => {
          const body = document.body;
          const key = "ocgsc-fullpage";
          const count = Number(body.dataset.ocgscFullpage ?? "0") + 1;
          body.dataset.ocgscFullpage = String(count);
          body.classList.add(key);
          return () => {
            const left = Number(body.dataset.ocgscFullpage ?? "1") - 1;
            body.dataset.ocgscFullpage = String(Math.max(0, left));
            if (left <= 0) body.classList.remove(key);
          };
        }, []);

        React.useEffect(() => {
          const timer = window.setInterval(() => setNow(Date.now()), 10_000);
          return () => window.clearInterval(timer);
        }, []);

        const write = async (body) => {
          setSaving(true);
          setMessage(null);
          try {
            const res = await fetch(COOKIE_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json === null || json.ok !== true) {
              setMessage({ tone: "error", text: (json && json.message) || `HTTP ${res.status}` });
              return false;
            }
            return true;
          } catch (error) {
            setMessage({ tone: "error", text: error && error.message ? error.message : String(error) });
            return false;
          } finally {
            setSaving(false);
          }
        };

        const save = async () => {
          const body = {};
          if (draft.trim().length > 0) body.credential = draft.trim();
          if (workspaceDraft.trim().length > 0) body.workspace = workspaceDraft.trim();
          if (Object.keys(body).length === 0) {
            setMessage({ tone: "error", text: t("error.noCredential") });
            return;
          }
          if (await write(body)) {
            setDraft("");
            setWorkspaceDraft("");
            setMessage({ tone: "ok", text: t("conn.saved") });
            setStamp((value) => value + 1);
          }
        };

        const disconnect = async () => {
          setSaving(true);
          setMessage(null);
          try {
            const res = await fetch(COOKIE_ROUTE, { method: "DELETE" });
            const json = await res.json().catch(() => null);
            if (!res.ok || json === null || json.ok !== true) {
              setMessage({ tone: "error", text: (json && json.message) || `HTTP ${res.status}` });
              return;
            }
            setMessage({ tone: "ok", text: t("conn.cleared") });
            setStamp((value) => value + 1);
          } catch (error) {
            setMessage({ tone: "error", text: error && error.message ? error.message : String(error) });
          } finally {
            setSaving(false);
          }
        };

        const state = connectionState(payload);
        const credential = (payload && payload.credential) || {};
        const session = (payload && payload.session) || {};
        const totals = (payload && payload.totals) || {};
        const models = (payload && payload.models) || [];
        const recent = (payload && payload.recent) || [];
        const ok = payload && payload.ok === true;

        // The shell's own flow calls `uiWorkspace.pickDirectory()`, which resolves to a
        // path string or null. The raw remote answers with a Result envelope instead, so
        // both transports are tried and both shapes are accepted.
        const pickDirectory = async () => {
          // Desktop builds expose the native dialog directly on the window.
          const bridge = typeof globalThis === "undefined" ? undefined : globalThis.__DSH_DIRECTORY_PICKER__;
          if (bridge && typeof bridge.pick === "function") {
            const answer = await bridge.pick();
            if (typeof answer === "string") return answer;
            if (answer === null || answer === undefined) return null;
            if (answer.ok === true) return answer.value ?? answer.directory ?? null;
            if (answer.ok === false) throw new Error((answer.error && answer.error.message) || "directory picker failed");
          }
          const workspace = (ctx && ctx.uiWorkspace)
            || (ctx && typeof ctx.get === "function" ? ctx.get("uiWorkspace") : undefined);
          if (workspace && typeof workspace.pickDirectory === "function") {
            return workspace.pickDirectory();
          }
          const picker = (ctx && ctx.remote && ctx.remote.directoryPicker)
            || (ctx && typeof ctx.get === "function" ? ctx.get("remote.directoryPicker") : undefined);
          if (picker && typeof picker.pick === "function") {
            const result = await picker.pick();
            if (typeof result === "string") return result;
            if (result === null || result === undefined) return null;
            if (result.ok === true) return result.value ?? result.directory ?? null;
            const reason = result.error && result.error.message ? result.error.message : "directory picker failed";
            throw new Error(reason);
          }
          throw new Error("folder picker unavailable");
        };

        const exportSnapshot = async () => {
          setExporting(true);
          setExportMessage(null);
          try {
            // The native dialog belongs to the Host: it arrives through the
            // generated remote namespace this module declares in `inject`.
            const dir = await pickDirectory();
            if (typeof dir !== "string" || dir.trim() === "") {
              setExportMessage({ tone: "error", text: t("session.exportCancelled") });
              return;
            }
            const res = await fetch(EXPORT_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ session: sessionId, dir }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || json === null || json.ok !== true) {
              setExportMessage({
                tone: "error",
                text: t("session.exportFailed", { message: (json && json.message) || `HTTP ${res.status}` }),
              });
              return;
            }
            setExportMessage({ tone: "ok", text: t("session.exported", { path: json.path, size: formatBytes(json.bytes) }) });
          } catch (error) {
            setExportMessage({
              tone: "error",
              text: t("session.exportFailed", { message: error && error.message ? error.message : String(error) }),
            });
          } finally {
            setExporting(false);
          }
        };

        const statusLine = [
          t(state.key),
          credential.workspace ? t("conn.workspace", { id: credential.workspace }) : (credential.configured ? t("conn.discovered") : null),
          ok && payload.fetchedAt ? `${formatAge(now - payload.fetchedAt)} ago` : null,
        ].filter(Boolean).join(" · ");

        const connectionCard = h("div", { className: "ocgsc-card", key: "connection" },
          h("div", { className: "ocgsc-card-head" },
            h("span", { className: "ocgsc-dot", "data-state": state.tone }),
            h("span", { className: "ocgsc-card-title" }, t("conn.title")),
            h("span", { className: "ocgsc-spacer" }),
            h("span", { className: "ocgsc-status" }, statusLine)),
          h("label", { className: "ocgsc-row" },
            h("span", { className: "ocgsc-row-label" }, t("conn.credential")),
            h("span", { className: "ocgsc-row-hint" }, t("conn.credentialHint")),
            h("input", {
              className: "ocgsc-input",
              type: "password",
              autoComplete: "off",
              spellCheck: false,
              placeholder: t("conn.credentialPlaceholder"),
              value: draft,
              onChange: (event) => setDraft(event.target.value),
            })),
          h("label", { className: "ocgsc-row" },
            h("span", { className: "ocgsc-row-label" }, t("conn.workspace")),
            h("span", { className: "ocgsc-row-hint" }, t("conn.workspaceHint")),
            h("input", {
              className: "ocgsc-input",
              type: "text",
              autoComplete: "off",
              spellCheck: false,
              placeholder: t("conn.workspacePlaceholder"),
              value: workspaceDraft,
              onChange: (event) => setWorkspaceDraft(event.target.value),
            })),
          h("div", { className: "ocgsc-actions" },
            h("button", {
              className: "ocgsc-btn",
              "data-variant": "primary",
              type: "button",
              disabled: saving,
              onClick: save,
            }, saving ? t("conn.saving") : t("conn.save")),
            h("button", {
              className: "ocgsc-btn",
              type: "button",
              disabled: saving,
              onClick: disconnect,
            }, t("conn.disconnect")),
            message !== null
              ? h("span", { className: "ocgsc-msg", "data-tone": message.tone }, message.text)
              : null),
          !ok && payload !== null
            ? h("div", { className: "ocgsc-note" }, noticeText(payload, t))
            : null);

        const hintLine = ok ? (() => {
          const hints = [t("hint.window")];
          if (typeof payload.retentionDays === "number") hints.push(t("hint.retention", { days: payload.retentionDays }));
          if (payload.truncated && typeof payload.scanned === "number") hints.push(t("hint.truncated", { n: payload.scanned }));
          if (totals.unpriced > 0) hints.push(t("hint.unpriced", { n: totals.unpriced }));
          return hints.join(" ");
        })() : null;

        const sessionCard = h("div", { className: "ocgsc-card", key: "session" },
          h("div", { className: "ocgsc-card-head" },
            h("span", { className: "ocgsc-card-title" }, t("session.title")),
            h("span", { className: "ocgsc-spacer" }),
            h("span", { className: "ocgsc-status" }, ok
              ? t("session.window", {
                start: formatClock(session.startedAt),
                duration: formatDuration(session.durationMs),
              })
              : t("session.nodata"))),
          ok
            ? h("div", { className: "ocgsc-hero" }, formatUsd(totals.costUsd))
            : h("div", { className: "ocgsc-empty" }, t("session.nodata")),
          ok && session.id ? h("div", { className: "ocgsc-note" }, t("session.newest", { id: session.id })) : null,
          ok
            ? h("div", { className: "ocgsc-stats" },
              stat(t("session.total"), formatUsd(totals.costUsd)),
              stat(t("session.requests"), formatCount(totals.requests)),
              stat(t("session.tokens"), formatCount(totals.tokens)),
              stat(t("session.input"), formatCount(totals.inputTokens)),
              stat(t("session.output"), formatCount(totals.outputTokens)),
              stat(t("session.cacheRead"), formatCount(totals.cacheReadTokens)))
            : null,
          hintLine !== null ? h("div", { className: "ocgsc-note" }, hintLine) : null);

        const modelsCard = ok
          ? h("div", { className: "ocgsc-card ocgsc-wide", key: "models" },
            h("div", { className: "ocgsc-card-head" },
              h("span", { className: "ocgsc-card-title" }, t("session.models"))),
            models.length === 0
              ? h("div", { className: "ocgsc-empty" }, t("session.none"))
              : [
                gridRow([t("table.model"), t("table.req"), t("table.tokens"), t("table.cost")], "mhead", "ocgsc-gridhead"),
                ...models.slice(0, 8).map((row, index) =>
                  gridRow([row.model, formatCount(row.requests), formatCount(row.tokens), formatUsd(row.costUsd)], `m${index}`)),
              ])
          : null;

        const recentCard = ok
          ? h("div", { className: "ocgsc-card ocgsc-wide", key: "recent" },
            h("div", { className: "ocgsc-card-head" },
              h("span", { className: "ocgsc-card-title" }, t("session.recent"))),
            recent.length === 0
              ? h("div", { className: "ocgsc-empty" }, t("session.none"))
              : [
                gridRow([t("table.time"), t("table.duration"), t("table.tokens"), t("table.cost")], "rhead", "ocgsc-gridhead"),
                ...recent.map((row, index) =>
                  gridRow([
                    h("span", { key: "t" },
                      formatClock(row.startedAt),
                      h("span", { className: "ocgsc-outcome", "data-outcome": row.outcome, style: { marginLeft: 8 } }, row.outcome)),
                    formatDuration(row.durationMs),
                    formatCount((row.inputTokens || 0) + (row.outputTokens || 0)),
                    formatUsd(row.costUsd),
                  ], `r${index}`)),
              ])
          : null;

        return h("div", { className: "ocgsc-view", "data-conversation-composer-overlay": "" },
          h("div", { className: "ocgsc-scroll", key: "scroll", style: { paddingBottom: "28px" } },
          h("div", { className: "ocgsc-viewhead", key: "head" },
            h("div", { key: "titles" },
              h("h2", { className: "ocgsc-viewtitle" }, t("page.title")),
              h("p", { className: "ocgsc-viewsub" }, t("page.lede"))),
            h("div", { className: "ocgsc-actions", key: "actions" },
              h("button", {
                className: "ocgsc-btn",
                type: "button",
                onClick: () => setStamp((value) => value + 1),
              }, t("session.refresh")),
              h("button", {
                className: "ocgsc-btn",
                "data-variant": "primary",
                type: "button",
                disabled: exporting || !ok,
                onClick: exportSnapshot,
              }, exporting ? t("session.exporting") : t("session.export")))),
          exportMessage !== null
            ? h("div", { className: "ocgsc-path", "data-tone": exportMessage.tone, key: "export" }, exportMessage.text)
            : null,
          h("div", { className: "ocgsc-grid", key: "grid" }, sessionCard, connectionCard),
          modelsCard,
          recentCard));
      };
    }

    function apply(ctx) {
      // Update in place: an HMR remount keeps the old tag, and re-inserting only
      // when absent would leave the previous stylesheet in charge.
      if (typeof document !== "undefined") {
        let tag = document.querySelector(`style[data-plugin-css="${CSS_ID}"]`);
        if (tag === null) {
          tag = document.createElement("style");
          tag.dataset.plugin = NS;
          tag.dataset.pluginCss = CSS_ID;
          document.head.appendChild(tag);
        }
        tag.textContent = CSS;
      }

      ctx.effect(() => {
        const disposers = [];
        if (typeof ctx.locale?.register === "function") {
          disposers.push(ctx.locale.register(NS, "en", en));
          disposers.push(ctx.locale.register(NS, "zh", zh));
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose();
            } catch {
              // already gone
            }
          }
        };
      }, "opencode-go-session-cost: dictionaries");

      // `bind` reads the active locale at call time and interpolates `{name}`.
      let translate;
      try {
        translate = ctx.locale.bind(NS);
      } catch {
        translate = (key, vars) => {
          let text = en[key] !== undefined ? en[key] : key;
          if (vars && typeof vars === "object") {
            for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
          }
          return text;
        };
      }

      const Page = createPage(translate, ctx);
      // `conversation.view` is a session-scope list: the Session header draws one
      // tab per entry (beside Chat and Trajectory) and renders the selected entry
      // in the body. Declaring `inject` hands the entry the current Session id.
      const register = () => ctx.slots.register({
        name: "conversation.view",
        id: "opencode-go-usage",
        order: 15,
        label: () => translate("page.tab"),
        inject: (sessionId) => ({ sessionId }),
      }, Page);

      if (typeof ctx.slots.inject === "function") {
        ctx.slots.inject("conversation.view", register);
      } else {
        ctx.effect(register, "opencode-go-session-cost: usage view");
      }
    }

    return { inject: ["slots", "locale", "remote", "remote.directoryPicker"], apply };
  },
});
