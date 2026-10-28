# dsh-oc-go-usage

A DSH plugin that shows what the current session cost on an OpenCode Go subscription. It adds
an **Opencode Go** tab to the session header, next to Chat and Trajectory, and a
`/opencode-go` command that prints the same numbers as text.

## What the tab shows

- Total cost, request count, and token totals for the session window, split into input,
  output and cache reads
- Cost and request count per model
- The six most recent requests
- Cost and request count per local hour
- DSH session figures read from the host: turns, steps, LLM and tool time, tokens per second,
  cache hit rate, and context composition
- **Refresh**, and **Save .txt**, which writes a plain-text snapshot into a folder you pick

## How the numbers are computed

OpenCode keeps one row per inference request in the console request log, with `startedAt`,
`finishedAt`, model, token counts, outcome and `cost` in USD. The plugin queries that log:

```
GET https://opencode.ai/console/api/request-logs
    ?category=inference&since=<session start>&until=<now>&limit=100
```

`since` is the DSH session's `header.createdAt` and `until` is the current time, so the query
window is the session lifetime. The total is the sum of `cost` over the rows inside it.

Rows are matched by time, not by session id. Another client using the same OpenCode Go
workspace during the window is counted too.

## Requirements

- DSH with the Web GUI
- An OpenCode Go subscription
- Access to the OpenCode console at opencode.ai

## Install

```
dsh plugin add github:x01Jin/dsh-oc-go-usage
```

Or in the GUI: Settings, Plugins, Add plugin, then paste `github:x01Jin/dsh-oc-go-usage`.
Restart DSH or reload the page. The tab appears on a session once it has started.

## Connect

The request log needs the console session, not an API key. A personal `oc_sk_...` key returns
403 on this endpoint.

1. Open <https://opencode.ai/console> and open the browser DevTools Network tab.
2. Reload the page and select any `request-logs` request.
3. Copy the full value of its `cookie` request header.
4. Open the session's **Opencode Go** tab, paste it into **Console session**, and press
   **Save**.

The workspace id (`wrk_...` from the console URL) is discovered automatically when the console
allows it. If the tab asks for one, paste the id or the full console URL.

A `cookie: ...` header and an `authorization: Bearer ...` value are both accepted. The
credential is stored in the DSH credential store as `OPENCODE_CONSOLE_COOKIE`, the workspace as
`OPENCODE_CONSOLE_WORKSPACE`. Only the host process sends it, and only to opencode.ai.

## Snapshots

**Save .txt** opens the system folder picker and writes one snapshot into the chosen folder.
Cancelling writes nothing.

The file is named `20261028-072459-eb5c23ae.txt` (local time, then the session id), so a folder
of snapshots sorts by time. It holds the window, totals, derived rates, the host-side DSH
figures, the per-model split, a local-hour histogram and the caveats that apply to that
capture.

## Configuration

All keys are optional.

| key | default | meaning |
| --- | --- | --- |
| `credentialRef` | `OPENCODE_CONSOLE_COOKIE` | DSH credential holding the console session |
| `apiBase` | `https://opencode.ai` | console origin |
| `cacheMs` | `20000` | how long one console answer is reused |
| `maxPages` | `25` | page cap for one read, 100 rows per page |
| `routePrefix` | `/opencode-go` | path prefix of the local routes |
| `orgId` | unset | workspace id when discovery is refused |

`credentialRef` can name an environment variable, because DSH credentials fall back to the
process environment.

## Routes

The browser half never talks to opencode.ai.

| method | path | purpose |
| --- | --- | --- |
| `GET` | `/opencode-go/session-cost` | totals for one session, `session` and `refresh` query params |
| `POST` | `/opencode-go/session-cookie` | store the credential and optional workspace |
| `DELETE` | `/opencode-go/session-cookie` | forget both |
| `POST` | `/opencode-go/session-export` | write the snapshot into a chosen folder |

## Limits

- The tab refreshes every 30 s while a session is open; the host caches one console answer for
  20 s.
- The console keeps request logs for 30 days. A session older than that returns partial data
  and the tab labels it.
- The console session expires with the browser session. When the tab says unauthorized, paste a
  fresh cookie.
- A resumed session keeps one window from its original start, so the time in between is counted
  when it falls in the same workspace.
- Rows without a `cost` are counted but not summed, and the panel reports how many.

## Development

```
npm test
```

The tests cover log summarising and paging, credential and workspace parsing, text rendering,
and registration of the client bundle in a stubbed module loader.

## License

MIT
