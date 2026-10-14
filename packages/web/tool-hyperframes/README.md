---
description: "Model-facing Hyperframes video tools (video_lint, video_snapshot, video_render): how deployments point the package at the Hyperframes CLI and observe the lint, preview, and render tools the model drives over a composition."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-hyperframes

English | [中文](README.zh.md)

## Summary

`dsh-tool-hyperframes` gives the model three tools over a Hyperframes video project: `video_lint` validates a composition, `video_snapshot` captures key frames and grids up to nine for visual checks, and `video_render` produces the final MP4. Choose it when an agent authors Hyperframes compositions and must validate, preview, and render them inside the loop. Every tool shells out to the Hyperframes CLI, so the CLI must be reachable; grid composition also needs ImageMagick. Each tool takes a project directory and returns a structured summary.

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

Load the package in a composition that gives the model a Hyperframes project directory to work on; it adds `video_lint`, `video_snapshot`, and `video_render` to the toolset and one guidance section to the system prompt.

### When to choose it

Choose this package when the model drives Hyperframes authoring end to end: lint a composition for structural and timing mistakes, capture representative frames to confirm it looks right, then render the MP4. It delegates every operation to the Hyperframes CLI, so it fits deployments that already provide the CLI and want the model to act on a project directory instead of invoking the CLI through a shell. There is no per-tool enablement config; mounting the package exposes all three.

### Minimal configuration

Mount the package; the three tools register with the default CLI lookup.

```yaml
- name: '@deepseek-ai/dsh-tool-hyperframes'
```

| Field | Default | Meaning |
|---|---|---|
| `hyperframesCliPath` | `hyperframes` | Executable invoked for every lint, snapshot, and render call; set an absolute path when the CLI is not on `PATH` |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-hyperframes) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design; the observable behavior is covered in [Use this package](#use-this-package).

### Design philosophy

The package is a thin model-facing adapter over the Hyperframes CLI:

- **The CLI owns every operation.** Each tool resolves the project path, builds a CLI argument vector, spawns the configured executable with the project directory as the working directory, and forwards the cooperative abort signal. No composition parsing, rendering, or frame capture happens inside the package.
- **Output is narrowed to a structured result.** Lint reads `--json` output when it parses and falls back to a line-oriented text parse; snapshot scans the CLI output for written PNG paths; render confirms the output file exists and measures duration and size. An unrecognized severity is treated as an error so a finding is never silently downgraded.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, system-prompt section, the three tool registrations, CLI spawn, and output parsing |
| — | No runtime invariant companion is published; this model-facing adapter has no independent lifecycle stream, and the CLI owns every operation it reports. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the package-level contract is not enough.

- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-hyperframes) — the exact `video_lint`, `video_snapshot`, and `video_render` schemas.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-hyperframes) — every accepted config field and its source declaration.
- [Web package map](../README.md) — the capability family this package ships beside.

-----

<a id="model-experience"></a>
## Model Experience

### System prompt

#### What the model sees

The package contributes one tool-guidance section, registered independently of the tool schemas.

##### Hyperframes tool guidance

```markdown
Use video_lint to validate Hyperframes projects before rendering. Use video_snapshot for visual verification at specific time points. Use video_render to produce the final MP4 output.
```

#### Token effect

Fixed guidance cost per request while the package is mounted; it does not scale with the number of calls.

#### KV Cache effect

Prefix-stable while the section text is unchanged. Plugin lifecycle may invalidate reuse from the first changed prompt section.

### Tool schemas

#### What the model sees

The model sees the generated [`video_lint`, `video_snapshot`, and `video_render` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-hyperframes). The CLI path is a deployment setting, not a model argument.

#### Token effect

Fixed schema cost per request for the three tools; no config disables an individual tool.

#### KV Cache effect

Prefix-stable while the definitions are unchanged. Plugin lifecycle may invalidate reuse from the first changed schema token.

### Tool results

#### What the model sees

Each tool renders its `summary` field as the result text — for example `Lint passed with 0 warning(s)`, `Captured 3 snapshot(s) and composed grid at <path>`, or `Rendered to <path> (12MB, 4.3s)`. Failures render `Render failed: <stderr>`, `Snapshot failed: <stderr>`, or `Failed to execute <op>: <message>`; an invalid project path throws before any CLI call.

#### Token effect

The rendered summary is one short line resent until compaction; the structured result additionally carries the findings, snapshot paths, or render metadata.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the tools are incomplete or need deployment cooperation. They are current package constraints.

- **The Hyperframes CLI must be installed and reachable** — every operation spawns `hyperframesCliPath`; a missing executable surfaces as a failed tool result, and the package never vendors or downloads the CLI.
- **Snapshot grid composition needs ImageMagick** — `video_snapshot` shells to `magick montage` for a multi-frame grid; when ImageMagick is absent the individual PNGs are still captured and `grid_path` is omitted.
- **Renders block until the CLI exits** — `video_render` does not stream progress; the call resolves only when the render finishes or the abort signal fires, so a long render holds the tool call open.
- **Lint output parsing is best-effort** — the tool prefers `hyperframes lint --json` and falls back to a line-oriented `[severity] message at location` parse; a CLI output format outside both shapes yields no findings rather than an error.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
