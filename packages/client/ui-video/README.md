---
description: "Video-production shell mode for the web GUI: a top-bar switch that lays a project roster, a script-and-timeline preview, and the real conversation surface in its chat-only posture side by side, for users composing or debugging the browser video surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video

English | [中文](README.zh.md)

## Summary

This package adds a video-production mode to the web GUI. Its top-bar switch replaces the default three-column frame with a project roster on the left, a preview in the centre, and the shipped conversation surface on the right in a chat-only posture — the real transcript and one input, without the View tabs, model seat, or composer tool row. The centre toggles between the formatted `script.json` and a player over a ruler, three aligned tracks, and a seekable playhead. Mount it with [`dsh-host-video-project`](../../host/video-project/README.md), which serves the data.

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

The switch selects between the default layout and the `video` mode. In video mode the roster column lists discovered projects most-recent first, each with its title, shot count, render badge, and update time; selecting one drives the centre pane, and with nothing chosen the newest project opens on its own. Both panes share one roster controller that polls the host every five seconds, so shots, narration audio, and a render an agent writes into the project directory appear without a reload.

The centre pane's top-right toggle switches between two surfaces. **Script** lays `script.json` out for reading — the title, summary, and every shot's visual-kind badge, duration, description, still, and full narration — never as raw JSON. **Preview** plays the project: a rendered one runs its newest `.mp4` through the host's Range-aware media route with native transport, while an unrendered one runs a virtual clock over the shot segments, showing the active shot's still as the picture and its narration as the subtitle and playing each shot's narration audio in turn. Under the player a ruler and three aligned tracks — subtitle, visual thumbnail, and audio waveform — share one horizontal geometry, so the zoom control at the ruler's right end scales all three together and dragging anywhere on them seeks the playhead.

The view follows the project's stage: a project that has only its script opens in **Script**, and one whose render has appeared opens in **Preview**; a manual toggle survives polling until the project moves to a new stage. The right column is the frame's own conversation surface in its chat-only posture — bubble Markdown, collapsible intermediate steps, and one input, without the View tabs, the model seat, or the composer tool row — so a video-production request typed there runs the session's agent preset and renders exactly as it does in the default layout.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The node half is an empty `apply` that keeps the plugin on the host roster; the browser half ships through `exports["./client"]`, discovered by the `dsh.client` declaration in `package.json` (inject `locale`, `ui-layout`, `ui-renderer`; platform `web`).

The browser `apply` registers the `video` locale dictionaries, one alternative shell mode through `ctx.layout.registerShellMode`, and two panes on the `shell.mode.pane` keyed slot. The mode spec fixes `columns: '260px minmax(0, 1fr) 400px'` and three panes — `projects`, `preview`, and `{ kind: 'conversation', simple: true }` — so the frame draws the switch and lays the panes out without knowing what a video project is; the `simple` flag re-mounts the frame's own session-maybe surface in its chat-only posture rather than a copy. The label is a thunk resolved per render, so the tab follows the active locale without re-registration.

One `VideoProjectsController` ([`src/client/video-store.ts`](src/client/video-store.ts)) owns the roster, the detail, the view mode, and the decoded-waveform cache the two panes share, so a selection on the left is what the centre renders. It reads the host's `/api/video/*` routes by same-origin `fetch` — the connection layer already authenticated the browser — and polls on an interval because no forwarded event announces a changed `script.json`; an in-flight poll is not doubled up. Each detail load resolves the project's stage and, only when the stage changed, re-drives the view mode, so polling never fights a manual toggle. Waveform peaks are decoded once per audio path through the Web Audio API and cached on the snapshot; a decode that fails caches an empty set, which draws the placeholder bar. The pane slot is filled with `ctx.slots.inject` because the frame declares it only when the mode body first renders.

The timeline is pure math over the shots ([`src/client/timeline.ts`](src/client/timeline.ts)): `buildSegments` places each shot by cumulative duration, `rulerTicks` picks a tick step that keeps marks legible at the current zoom, and shared pixel↔second conversions drive the ruler, the three tracks, and the playhead, so they cannot drift apart.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Node half: empty `apply` keeping the plugin on the host roster |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: locale, shell mode, and the two pane registrations |
| [`src/client/video-store.ts`](src/client/video-store.ts) | Roster controller, host transport, poll, view mode, and waveform cache |
| [`src/client/timeline.ts`](src/client/timeline.ts) | Pure segment, ruler-tick, and pixel↔second math |
| [`src/client/waveform.ts`](src/client/waveform.ts) | PCM-to-peaks reduction and the browser audio decode |
| [`src/client/VideoProjectsPane.tsx`](src/client/VideoProjectsPane.tsx) | Left roster pane |
| [`src/client/VideoPreviewPane.tsx`](src/client/VideoPreviewPane.tsx) | Centre pane: script/preview toggle, playback state, and zoom |
| [`src/client/VideoScriptView.tsx`](src/client/VideoScriptView.tsx) | Formatted `script.json` surface |
| [`src/client/VideoPlayer.tsx`](src/client/VideoPlayer.tsx) | Rendered `<video>` or the active shot's still and subtitle |
| [`src/client/VideoTimeline.tsx`](src/client/VideoTimeline.tsx) | Ruler, three tracks, playhead, transport, and zoom control |
| [`src/client/locales.ts`](src/client/locales.ts) | Bilingual `video` namespace dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-host-video-project`](../../host/video-project/README.md) — the host routes this surface reads.
- [`dsh-video-app` bundle](../../bundle/video-app/README.md) — the profile layer that mounts both halves.
- [`dsh-client-ui-layout`](../ui-layout/README.md) — the shell mode switch, the `simple` conversation pane, and the pane layout this registers into.
- [`dsh-client-ui-conversation`](../ui-conversation/README.md) — the conversation surface the `simple` flag renders chat-only.
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

- **The unrendered player is a virtual clock, not a render.** Before a project's `.mp4` exists, the preview advances a playhead by shot duration and plays each shot's narration audio in turn; it mixes no music bed, renders no transition, and is not frame-accurate against the eventual video. The rendered `.mp4` is the real preview.
- **The waveform needs Web Audio.** The audio track decodes each shot's narration through `AudioContext.decodeAudioData`; a shot whose audio is absent, still being written, or undecodable draws a placeholder bar instead.
- **The roster polls; it is not pushed.** A change an agent writes into a project directory appears on the next five-second poll, not instantly, and only while a video pane is mounted.
- **The mode needs the layout service.** The switch and panes register against `ctx.layout` and the `shell.mode.pane` slot; a composition without the layout service draws no video mode.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

No invariant companion is published because the package is a browser-side slot occupant whose roster controller holds the only copy of project state, so no independent observation of it can diverge.

</details>
