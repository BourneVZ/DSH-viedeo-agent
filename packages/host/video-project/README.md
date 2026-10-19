---
description: "Discovers script.json video projects under the registered workspaces and serves their shot timeline, media bytes, and producing session over the authenticated /api/video routes, for operators wiring or debugging the video shell mode's data plane."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-video-project

English | [中文](README.zh.md)

## Summary

The browser video surface reads four authenticated routes this package serves. It finds every directory holding a `script.json` under your registered workspaces, resolves each shot's image, thumbnail, and narration audio against the project, locates the newest rendered `.mp4`, names the session that produced it, and streams media with HTTP `Range` support so a `<video>` element can seek. Choose it when you mount the video shell mode; it registers no Cordis service and no model-facing tool, and the browser half is its only consumer. It reads only inside registered workspaces, and serves one file up to a byte ceiling.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside the connection, filesystem, workspace, and session-query services in a web composition; the video shell mode's panes then read it over `/api/video`.

### When to choose it

Choose this package when a profile serves the video shell mode and needs its project roster, shot timeline, media bytes, and producing session; it is the host half of [`dsh-client-ui-video`](../../client/ui-video/README.md) and ships in the [`video-app` bundle](../../bundle/video-app/README.md). Avoid it in a profile with no browser video surface: it registers routes nothing reads. It has no standalone fallback — a composition without it simply serves no `/api/video` routes.

### Minimal configuration

The smallest mount that works, as a `cordis.yml` row:

```yaml
- id: video-project
  name: '@deepseek-ai/dsh-host-video-project'
```

| Field | Default | Meaning |
|---|---|---|
| `scanDepth` | `3` | Directory levels walked below each workspace root while looking for `script.json` |
| `maxMediaBytes` | `536870912` | Inclusive byte ceiling on one `/api/video/media` response |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-host-video-project) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin claims four routes inside one `ctx.effect`, so disposing its fiber removes all four. A video project is any directory holding a `script.json` — the file the video preset's persona requires the agent to write. Discovery walks each registered workspace root breadth-first to `scanDepth`, stops descending at the first `script.json`, skips dot-directories and dependency trees (`node_modules`, `dist`, and friends), and caps one pass at 20,000 directories.

`script.json` is read tolerantly: the persona fixes its required content but not its key spelling, so every field accepts English and Chinese aliases, a shot that declares no duration reads from the span its start and end offsets enclose, and a file that is not an object or carries no shot list is reported as a parse error rather than an empty project — the project still lists so the user can see and fix it. The list route answers with recency, shot count, and render presence only; the project route resolves each declared asset against the project directory and keeps only the paths that exist as regular files. Recency comes from `node:fs/promises` because the `FileSystem` seam reports no timestamps; a backend whose execution world is not the host yields `0` and sorts last.

The media route streams one byte window in 1 MiB chunks through `FileSystem.readByteRange` and honors a single HTTP `Range`, the minimum a browser `<video>` needs to seek. Access is fenced to the registered workspaces, regular files only, under `maxMediaBytes`; the Connection service authenticates the request before the handler runs, and a `sandbox; default-src 'none'` policy keeps a served HTML or SVG file from running script on the API origin.

The producing-session route answers which session built one project. A session records the workspace root it started in, never the project subfolder the agent later created inside it, so every project under one root matches the same candidate sessions and the directory alone cannot choose between them. The route therefore reads the log: it walks the corpus newest-first, keeps the sessions whose recorded root contains the project directory, and asks the full-text index for that directory relative to the root. The index tokenizer treats `\` and `/` alike and drops both, so one relative query matches either spelling of the path with no log line read. A project sitting at its session's own root leaves no path below it to search for and is answered without a probe; at most 12 candidates are probed, and no reference in any of them answers `null`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema and the four-route effect |
| [`src/discovery.ts`](src/discovery.ts) | Workspace walk, render search, and asset resolution |
| [`src/script.ts`](src/script.ts) | Tolerant `script.json` reader with bilingual key aliases |
| [`src/session-match.ts`](src/session-match.ts) | Producing-session search over the corpus and its full-text index |
| [`src/media.ts`](src/media.ts) | Range-aware authenticated byte serving |
| [`src/types.ts`](src/types.ts) | Wire types of the four routes |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-client-ui-video`](../../client/ui-video/README.md) — the browser half that reads these routes.
- [`dsh-video-app` bundle](../../bundle/video-app/README.md) — the profile layer that mounts both halves.
- [Workspace subsystem](../../../docs/subsystems/workspace.md) — the workspace roots discovery walks.
- [`dsh-session-query`](../../session-query/session-query/README.md) — the session corpus and full-text index the producing-session route reads.
- [HTTP server subsystem](../../../docs/subsystems/web-server.md) — the transport the routes register on.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package serves HTTP routes to a browser and registers no prompt, message, schema, stream, or tool the model sees.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits tell you where the data plane needs care; they are current package constraints, not a task backlog.

- **Discovery is depth- and visit-capped.** A project deeper than `scanDepth` below a workspace root, or beyond the 20,000-directory ceiling in one pass, is not found; raise `scanDepth` for a deeper tree.
- **Recency needs a host-visible filesystem.** Directory modification times come from `node:fs/promises`; a sandbox or remote backend whose execution world is not the host yields `0` and sorts its projects last.
- **Media is fenced and capped.** A path outside every registered workspace answers `403`, a non-regular file `403`, and a file above `maxMediaBytes` answers `413`; raise the ceiling for larger renders.
- **Shot keys are alias-matched, not schema-validated.** A `script.json` whose fields use spellings outside the alias lists reads as empty text; the file still lists, with a parse error when it carries no shot array.
- **The producing session is evidence-matched, not recorded.** No file names the session that built a project, so the route infers it from log references and probes at most 12 candidate sessions; a project whose path no retained log mentions answers `null`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No invariant companion is published because the routes read the filesystem fresh on every request and cache no project state, so there is no second observation that could diverge.

</details>
