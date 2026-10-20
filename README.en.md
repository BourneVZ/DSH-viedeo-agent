# AI Video-Production Agent

[中文](README.md) | English

This repository turns a chat session into a finished video. You describe a topic; the agent writes a shot-by-shot script, synthesizes the narration, generates or animates the visuals, assembles a HyperFrames composition, and renders an MP4 — while a browser workbench shows the script, the shot timeline, and the render as they appear.

It is built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), an open-source agent harness from [DeepSeek AI](https://deepseek.com) whose everything-is-a-plugin architecture runs on [Cordis](https://github.com/cordiverse/cordis); the design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512). The video capability is one more profile over that harness rather than a rewrite of it: every piece is a plugin, and the few base files that had to change for the workbench and the profile are listed one by one in [NOTICE](NOTICE).

DeepSeek Harness is in _developer preview_ and iterating rapidly, so **compatibility-breaking changes will land**. Read the [safety notice](SAFETY.md) before you run anything.

## What it does

Everything below runs in one browser tab after one command.

| Capability | What you get |
| --- | --- |
| Three-phase production | The agent scripts, then composes, then renders — and stops for your confirmation between phases |
| Shot timeline workbench | A ruler with subtitle, thumbnail, and audio-waveform tracks over one shared seekable playhead |
| Script and player views | Read the formatted `script.json`, or play the newest MP4; an unrendered project plays a virtual clock over its shots |
| Producing-session recall | Selecting a project offers the conversation that produced it, matched from the session logs |
| Media tools in the loop | `generate_speech`, `generate_image`, `video_lint`, `video_snapshot`, and `video_render` are ordinary agent tools |

## How a video gets made

The agent follows a fixed three-phase contract declared in [the `video` preset](packages/preset/agent-presets/presets/video/agent.cordis.yml). Each phase ends by reporting what it produced and waiting for you.

1. **Script** — split the topic into shots, give every shot its narration, and write the whole plan to `script.json` inside the project folder.
2. **Compose** — synthesize each shot's narration, measure the audio, set that shot's on-screen duration from the measurement, then build the visuals as HTML animation or generated images.
3. **Render** — only when you ask: `video_lint` the project, `video_snapshot` key frames to check them visually, then `video_render` the MP4.

The workbench keeps three panes side by side; [the `ui-video` README](packages/client/ui-video/README.md) owns the detail.

- **Left** — the project roster, rescanned every five seconds across every registered workspace.
- **Centre** — the script view and the timeline player, switching to follow the project's stage.
- **Right** — the conversation in a chat-only posture: the transcript and one input, with no view tabs or composer tool row.

<a id="run"></a>

## Quick start

### Requirements

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`, the repository's declared `packageManager`
- The HyperFrames CLI reachable on `PATH`, plus ImageMagick for snapshot grids
- A DeepSeek API key for the model

### Credentials

Write a `.env` at the repository root. The project file outranks a user-level one, and no key is ever committed.

```sh
DEEPSEEK_API_KEY=sk-your-key
EVOLINK_API_KEY=your-evolink-key
DASHSCOPE_API_KEY=your-dashscope-key
```

Only `DEEPSEEK_API_KEY` is needed to talk to the agent. The other two are read when the model calls `generate_image` and `generate_speech`; [the providers guide](docs/user/guide/providers.md) covers model configuration.

<a id="run-from-source"></a>

### Launch

From the repository root:

```sh
pnpm install
pnpm run build
pnpm dsh --profile video
```

The command prints a URL carrying a one-time token and opens it in your browser; the bare address answers `401` without that token. It serves on `http://127.0.0.1:3080` by default — pass `--port <port>` for another port, or `--no-open` to serve without opening a browser.

### First video

1. Register the folder that should hold your video projects as a workspace.
2. Start a session; the `video` profile already defaults it to the video-production agent.
3. Ask for a video, and confirm each phase as the agent reaches it.
4. Select the project in the roster to follow its script, timeline, and render.

The video workbench shows projects, preview, and conversation only — it has no sidebar, and the workspace list is managed there in the `web` profile. Both profiles share `$DSH_HOME/storages/workspace.json`, so a workspace is registered once.

## Run modes

A profile is an ordered stack of bundle patch layers. `video` is what this repository adds; the other three ship with the harness.

| Profile | Layers | Use it for |
| --- | --- | --- |
| `video` | `dsh-base` + `dsh-web-app` + `dsh-video-app` | The video workbench and the video-production agent |
| `web` | `dsh-base` + `dsh-web-app` | The plain browser chat UI |
| `headless` | `dsh-base` + `dsh-headless` | One task from a terminal, then exit |
| `acp` | `dsh-base` + `dsh-acp-app` | Automation over the Agent Client Protocol |

## External dependencies

The media tools call services and binaries the harness does not bundle.

| Dependency | Used by | Without it |
| --- | --- | --- |
| HyperFrames CLI | `video_lint`, `video_snapshot`, `video_render` | The three render tools fail; scripting and composing still work |
| ImageMagick | `video_snapshot` grid composition | Snapshots return single frames instead of grids |
| EvoLink API key | `generate_image` | The tool reports the missing key when called |
| DashScope API key | `generate_speech` | The tool reports the missing key when called |

## Repository layout

[packages/README.md](packages/README.md) owns the full group map. These are the four places a video change touches.

- `packages/preset/agent-presets/presets/video/` — the agent's persona and tool composition, where the three-phase contract lives
- `packages/host/video-project/` — the four `/api/video` routes: project list, shot timeline, media bytes, producing session
- `packages/client/ui-video/` — the workbench: shell mode, roster, script and timeline player, session banner
- `packages/web/tool-hyperframes/`, `tool-image-gen/`, `tool-tts/` — the three media tool packages

## Development

Start with the [development guide](docs/development.md), then read the [architecture map](docs/architecture.md) before changing anything under `packages/`.

- [AGENTS.md](AGENTS.md) — the standing orders every contributor and agent works under
- [docs/glossary.md](docs/glossary.md) — the vocabulary the codebase uses precisely
- [docs/testing.md](docs/testing.md) — what each kind of change must prove
- [CONTRIBUTING.md](CONTRIBUTING.md) — how changes are handled, including whether upstream accepts external PRs

## Safety

The agent runs shell commands, writes files, and calls paid external APIs on your machine. [SAFETY.md](SAFETY.md) states what it can reach and how the approval stack limits it; read it before the first run.

Four things to know before this pipeline produces a video you intend to publish:

- **Cost**: `generate_image` and `generate_speech` call EvoLink and Alibaba Cloud DashScope with your own key, so whatever those services charge is settled between you and them on their terms; this repository never touches the bill.
- **Where your content goes**: narration text and image prompts leave your machine as request bodies to `https://api.evolink.ai` and `https://dashscope.aliyuncs.com`. Keep material you would not send to a third party out of the project.
- **Labeling generated content**: the MP4 that `video_render` writes carries no visible "AI-generated" label and no implicit label metadata. In mainland China, the measures on labeling AI-generated synthetic content and their mandatory national standard oblige a service provider that serves the public to add both; add whatever your own jurisdiction requires before publishing, and leave the label in the finished video.
- **Rights in the material**: the project's user owns the copyright in narration text, fonts, images, and background music, plus any likeness or voice consent. Generated visuals do not acquire a third party's permission by themselves.

## License

This repository is licensed in layers:

- The DeepSeek Harness base — every package under `packages/` except the video layer, plus `apps/`, `docs/`, and `scripts/` — is under [MIT](LICENSE), copyright DeepSeek.
- The Cordis framework source in `vendor/` keeps its own upstream MIT license file in each directory; `native/system/` is under [BSD-3-Clause](native/system/LICENSE).
- The video-production layer — `video-project`, `ui-video`, `video-app`, the video preset, and the three media tool packages — is original to this repository and is offered on the same MIT terms.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) names every dependency and its license, and [pnpm-lock.yaml](pnpm-lock.yaml) pins the full closure by exact version.

Provenance, the list of modified base files, the trademark and non-endorsement statement, and the distribution gaps still open are recorded in [NOTICE](NOTICE).
