---
description: "Model-facing Hyperframes tools for video project lint, snapshot, and render"
---

# `@deepseek-ai/dsh-experimental-tool-hyperframes`

English | [中文](README.zh.md)

## Summary

This package provides three model-facing tools for working with Hyperframes video projects:

- `video_lint` — Static validation of a Hyperframes composition for common mistakes
- `video_snapshot` — Capture key frames as PNG screenshots, optionally composing multiple time points into a grid
- `video_render` — Render a Hyperframes composition to MP4

All tools accept a project directory path as input and delegate to the Hyperframes CLI.

## Table of Contents

- [Tools](#tools)
- [Configuration](#configuration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

## Tools

### `video_lint`

Validates a Hyperframes composition for common mistakes such as missing assets, invalid timing, or structural errors.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `project_path` | string | yes | Absolute path to the Hyperframes project directory |
| `verbose` | boolean | no | Show info-level findings (default: false) |

**Returns:** A JSON object with `success` (boolean), `findings` (array of issues), and `summary` (human-readable text).

### `video_snapshot`

Captures key frames from a Hyperframes composition as PNG screenshots. When multiple time points are provided (up to 9), the tool composes them into a grid image (3 per row).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `project_path` | string | yes | Absolute path to the Hyperframes project directory |
| `time_points` | number[] | no | Array of timestamps in seconds to capture (max 9). If omitted, uses even-spaced frames |
| `output_path` | string | no | Directory to write snapshots (default: `<project>/snapshots`) |

**Returns:** A JSON object with `success` (boolean), `snapshots` (array of captured file paths), `grid_path` (path to grid image if multiple time points), and `summary`.

### `video_render`

Renders a Hyperframes composition to MP4.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `project_path` | string | yes | Absolute path to the Hyperframes project directory |
| `output_path` | string | no | Output file path (default: `<project>/renders/<name>.mp4`) |
| `fps` | number | no | Frame rate (default: composition's data-fps or 30) |
| `quality` | string | no | Quality preset: `draft`, `looks`, `delivery` (default: `looks`) |

**Returns:** A JSON object with `success` (boolean), `output_path`, `duration_seconds`, `file_size_bytes`, and `summary`.

-----

## Configuration

```yaml
plugins:
  - id: tool-hyperframes
    plugin:
      require: '@deepseek-ai/dsh-experimental-tool-hyperframes'
    config:
      hyperframesCliPath: hyperframes  # Path to hyperframes CLI (default: assumes it's in PATH)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `hyperframesCliPath` | string | `hyperframes` | Path to the Hyperframes CLI executable |

-----

## Known Limitations and Deferred Work

- Requires Hyperframes CLI to be installed and accessible in PATH (or configured via `hyperframesCliPath`)
- Grid composition for `video_snapshot` requires ImageMagick or a compatible image processing library
- Render progress is not streamed; the tool blocks until render completes
