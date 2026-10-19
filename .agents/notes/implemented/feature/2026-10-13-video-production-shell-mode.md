# Agent Note: Video-production shell mode and video-app bundle

Status: implemented

English | [中文](2026-10-13-video-production-shell-mode.zh.md)

## Problem

The video preset (`packages/preset/agent-presets/presets/video`) composes a video-production agent, but the web GUI had no surface for it: a user drove the agent through the ordinary conversation and had no way to see the projects an agent wrote, preview a shot timeline, or play a render. The GUI frame is a fixed three-column layout (sidebar, conversation, rightbar) with no extension point for an alternative whole-shell layout, so a video surface could not be added without either forking the frame or restaging the conversation inside a feature plugin.

## Decision

The web GUI gains an alternative-shell-mode extension point, and the video surface is built on it as three packages plus a bundle and a profile.

`dsh-client-ui-layout` owns the mechanism: a feature plugin registers a `ShellModeSpec` through `ctx.layout.registerShellMode`, the frame draws a top-bar switch beside the default layout, and while a mode is selected it replaces the three-column grid with the spec's own pane row. The frame knows no feature. A spec's panes are either `{ kind: 'conversation' }`, which re-renders the frame's own `conversation` slot at the position the mode chooses — optionally `simple: true` for a chat-only posture that drops the View tabs, the model seat, the composer tool row, and the header corner seat, keeping the transcript and one input — or `{ kind: 'pane'; pane: <key> }`, which dispatches into a new root-scoped keyed slot `shell.mode.pane`. Reusing the `conversation` slot is the load-bearing choice: the video mode keeps the real session header, transcript, and composer — bubble Markdown, collapsible intermediate steps, and the composer that runs the session's agent preset — instead of a copy a feature plugin would have to maintain.

`dsh-host-video-project` is the data plane: it discovers every directory holding a `script.json` under the registered workspaces and serves three authenticated routes below `/api/video` (project list, one project's resolved shot timeline, and Range-aware media bytes). It registers no Cordis service and no model-facing tool; the browser half is its only consumer.

`dsh-client-ui-video` is the browser half: it registers the `video` shell mode, the `projects` and `preview` panes on `shell.mode.pane`, and the `video` locale namespace. One roster controller polls the host every five seconds, because no forwarded event announces a changed `script.json`. The centre pane toggles between the formatted `script.json` and a player over a ruler and three aligned tracks — subtitle, visual thumbnail, and decoded audio waveform — with a shared seekable playhead and a zoom control; a rendered project plays its newest `.mp4`, and an unrendered one runs a virtual clock over the shot segments. The view follows the project's stage, so a script-only project opens on the script and a project whose render appeared opens on the player.

`dsh-video-app` is the bundle: a `dsh.bundle.patch` layer over `dsh-web-app` that inserts the two video rows and overrides the `agent-presets` row's `default` to `video`. The shipped `video` profile template names `dsh-base`, `dsh-web-app`, and `dsh-video-app` in that order, so `dsh --profile video` activates the surface with no further step.

### Package topology

| Package | Group | Role |
|---|---|---|
| `@deepseek-ai/dsh-host-video-project` | `host/` | `/api/video` discovery, timeline, and media routes |
| `@deepseek-ai/dsh-client-ui-video` | `client/` | video shell mode, roster and preview panes |
| `@deepseek-ai/dsh-video-app` | `bundle/` | patch layer mounting both and defaulting the preset |

The shell-mode mechanism itself lives in the existing `@deepseek-ai/dsh-client-ui-layout`; no new layout package was created.

## Alternatives considered

**Fork the frame into a video-specific shell.** A separate top-level component could hardcode the three-pane video layout. It lost because it duplicates the sidebar, conversation, and rightbar mounting the frame already owns, and every later frame change would have to be mirrored in two shells. The extension point keeps one frame and lets any feature contribute a mode.

**Restage the conversation inside the video plugin.** The video plugin could mount its own transcript and composer rather than reuse the frame's `conversation` slot. It lost because the conversation surface is large and session-bound; a copy would drift from the real one and re-implement bubble Markdown, collapsible steps, approvals, and the composer. The `{ kind: 'conversation' }` pane reuses the shipped surface verbatim.

**Push project changes over a forwarded event instead of polling.** The host could emit an event when a `script.json` changes. It lost because the agent writes into the project directory through the filesystem seam, which the video routes do not observe; wiring a watcher would add a new event surface for a five-second-stale read the UI already tolerates. Polling is the smaller mechanism and is documented as a limitation.

**Ship the video rows in `dsh-web-app` rather than a new bundle.** The web layer could carry the video rows directly. It lost because the video surface is optional and preset-specific; a separate `dsh-video-app` layer keeps `web` free of it and lets the `video` profile be the only surface that mounts it, matching how `headless` and `acp-app` layer over `base`.

## Consequences

The frame gained a general extension point any feature can use, at the cost of one more root-scoped keyed slot (`shell.mode.pane`) and a mode-switch store in `ui-layout`. The video surface is three packages that must stay in sync: the host route contracts, the browser transport, and the bundle patch that mounts them. The bundle activates only by being named in a profile's bundle list — `dsh plugin add` resolves against the npm registry and 404s for this unpublished in-box package — so the `video` profile template is the supported activation path. The preset default only fills an unset choice: a session already pinned to a preset keeps it, and a user-stored default still wins. The centre preview is a script-and-timeline player, not a shot list: before a render exists the player is a virtual clock over the shot segments and is not frame-accurate against the eventual video, and the audio track's waveform needs the Web Audio API, falling back to a placeholder bar when a shot's narration is absent or undecodable. The conversation pane's `simple` chat-only posture is a `ui-layout`/`ui-conversation` capability the video mode consumes, so another mode may reuse it without a second mechanism.
