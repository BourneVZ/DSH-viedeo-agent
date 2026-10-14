---
description: "Video-production shell mode for the web GUI: a top-bar switch that lays the project roster and shot preview beside the real conversation surface, for users composing or debugging the browser video surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video

English | [中文](README.zh.md)

## Summary

This package adds a video-production mode to the web GUI. Selecting its top-bar switch replaces the default three-column frame with a project roster on the left, a shot preview in the centre, and the shipped conversation surface on the right — the real session header, transcript, and composer, including bubble Markdown and collapsible intermediate steps, not a restaging of them. The roster lists every `script.json` project the host discovered; the centre plays a project's newest render or, before one exists, its shot sequence. Mount it with [`dsh-host-video-project`](../../host/video-project/README.md), which serves the data.

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

Mount this plugin in the web composition beside [`dsh-host-video-project`](../../host/video-project/README.md); the pair composes the whole surface in two cordis.yml rows and this row takes no config. The top bar grows a mode switch only while this plugin is mounted, and the video mode appears only after the layout service is present.

### What to expect

The switch selects between the default layout and the `video` mode. In video mode the roster column lists discovered projects most-recent first, each with its title, shot count, render badge, and update time; selecting one drives the centre pane. The centre plays the newest `.mp4` through the host's Range-aware media route when the project has a render, and otherwise shows an "unrendered" notice above the shot sequence in script order — each shot's thumbnail (or generated image, or a missing-still placeholder), visual-kind badge, duration, description, and narration. The right column is the frame's own conversation surface, so a video-production request typed there runs the session's agent preset and renders exactly as it does in the default layout. Both panes share one roster controller that polls the host every five seconds, so shots, narration audio, and a render an agent writes into the project directory appear without a reload.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The node half is an empty `apply` that keeps the plugin on the host roster; the browser half ships through `exports["./client"]`, discovered by the `dsh.client` declaration in `package.json` (inject `locale`, `ui-layout`, `ui-renderer`; platform `web`).

The browser `apply` registers the `video` locale dictionaries, one alternative shell mode through `ctx.layout.registerShellMode`, and two panes on the `shell.mode.pane` keyed slot. The mode spec fixes `columns: '260px minmax(0, 1fr) 400px'` and three panes — `projects`, `preview`, and `{ kind: 'conversation' }` — so the frame draws the switch and lays the panes out without knowing what a video project is; the conversation pane re-mounts the frame's own session-maybe surface rather than a copy. The label is a thunk resolved per render, so the tab follows the active locale without re-registration.

One `VideoProjectsController` ([`src/client/video-store.ts`](src/client/video-store.ts)) owns the roster and detail snapshot both panes share, so a selection on the left is what the centre renders. It reads the host's `/api/video/*` routes by same-origin `fetch` — the connection layer already authenticated the browser — and polls on an interval because no forwarded event announces a changed `script.json`; an in-flight poll is not doubled up. Each pane receives the store through the inject `hooks` compartment, and the pane slot is filled with `ctx.slots.inject` because the frame declares it only when the mode body first renders.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Node half: empty `apply` keeping the plugin on the host roster |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: locale, shell mode, and the two pane registrations |
| [`src/client/video-store.ts`](src/client/video-store.ts) | Roster controller, host transport, and poll |
| [`src/client/VideoProjectsPane.tsx`](src/client/VideoProjectsPane.tsx) | Left roster pane |
| [`src/client/VideoPreviewPane.tsx`](src/client/VideoPreviewPane.tsx) | Centre player and shot-sequence pane |
| [`src/client/locales.ts`](src/client/locales.ts) | Bilingual `video` namespace dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-host-video-project`](../../host/video-project/README.md) — the host routes this surface reads.
- [`dsh-video-app` bundle](../../bundle/video-app/README.md) — the profile layer that mounts both halves.
- [`dsh-client-ui-layout`](../ui-layout/README.md) — the shell mode switch and pane layout this registers into.
- [Web client slots](../../../docs/subsystems/slots.md) — the `shell.mode.pane` keyed slot and the slot currency.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package is browser chrome over host routes; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits tell you what the surface does not yet do; they are current package constraints, not a task backlog.

- **The preview is a player or a shot list, not a timeline.** The centre plays the newest render or lists shots in script order; the subtitle, visual-thumbnail, and audio tracks with a shared playhead and seek are deferred work.
- **The roster polls; it is not pushed.** A change an agent writes into a project directory appears on the next five-second poll, not instantly, and only while a video pane is mounted.
- **The mode needs the layout service.** The switch and panes register against `ctx.layout` and the `shell.mode.pane` slot; a composition without the layout service draws no video mode.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No invariant companion is published because the package is a browser-side slot occupant whose roster controller holds the only copy of project state, so no independent observation of it can diverge.

</details>
