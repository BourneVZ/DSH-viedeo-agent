# Agent Note: Hyperframes video tool promoted to a release package

Status: implemented

English | [中文](2026-10-14-hyperframes-tool-promoted-to-release.zh.md)

## Problem

The Hyperframes video tools (`video_lint`, `video_snapshot`, `video_render`) shipped as `@deepseek-ai/dsh-experimental-tool-hyperframes` under `packages/experimental/`, marked `private: true`. The video preset composes a video-production agent that relies on these tools, but a release package may not depend on an experimental one, so the promoted video surface could not name the tool package its agent needs. The three media tools the video agent uses — Hyperframes, image generation, and text-to-speech — were also absent from the generated tool catalog's boot manifest, so their model-visible schemas were never harvested and their package READMEs had no catalog anchor to link.

## Decision

`@deepseek-ai/dsh-tool-hyperframes` is a release package at `packages/web/tool-hyperframes`: the experimental name and `private: true` are gone, `publishConfig.access` is `public`, and the three tools keep their names and behavior. All three media tool packages — `tool-hyperframes`, `tool-image-gen`, and `tool-tts` — are registered in the `gen-tool-catalog` boot manifest, so the generated catalog harvests each tool's schema at boot and each README links its `#deepseek-aidsh-tool-*` anchor. Image generation and text-to-speech resolve their provider API key through the shared `credentialRefSchema` and `resolveCredentialValue` helpers in `dsh-credentials` and drop their own `dsh-launch-environment` dependency, so credential resolution has one owner instead of a per-package fallback.

## Alternatives considered

**Keep Hyperframes experimental and let the video preset depend on it anyway.** This lost because the release/experimental boundary is enforced: a published package may not pull in a private prototype, so shipping the video surface while its tools stayed experimental would either break the dependency rule or withhold the tools from the release the preset needs.

**Leave the media tools out of the generated catalog.** This lost because the model-experience README gate requires a tool-schema entry to link a real catalog anchor, and an unharvested package has no anchor; the tools' schemas would also stay invisible to anyone reading the catalog as the source of truth.

**Keep a per-package launch-environment credential fallback.** This lost because image generation and text-to-speech each hand-rolled the same read-credentials-else-environment resolution; one shared helper pair removes the duplication and the extra dependency edge.

## Consequences

Hyperframes is now public API subject to release stability, so its tool names, schemas, and behavior are commitments rather than prototype freedoms. The tool catalog boots three more packages to harvest their schemas. Credential resolution for the media tools has a single owner in `dsh-credentials`. Each of the three media tool packages carries a bilingual package-reference README with a Model Experience section, which the README gates now enforce.
