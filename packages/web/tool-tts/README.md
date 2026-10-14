---
description: "The model-facing generate_speech tool over the Qwen text-to-speech API: how deployments supply the API key, base URL, model, and default voice, and observe the text-to-speech tool the model calls."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-tts

English | [中文](README.zh.md)

## Summary

`dsh-tool-tts` gives the model a `generate_speech` tool that turns text into spoken audio through the Qwen text-to-speech model. Choose it when an agent needs a voiceover, narration, or an audio reply rather than text. The tool synthesizes speech, downloads the audio, and commits it to the durable attachment store as a WAV file, returning both the attachment and the provider's temporary URL. It needs a DashScope API key, resolved through the credential seam or the launch environment, and an attachment backend to persist the bytes.

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

Load the package in a composition that provides a DashScope API key and an attachment store; it adds `generate_speech` to the toolset so the model can request spoken audio from text.

### When to choose it

Choose this package when the model should produce spoken audio from text — a voiceover, narration, or an audio reply — through the Qwen text-to-speech model. Unlike an image-generation tool that hands back provider URLs, this tool downloads the synthesized audio and commits it to the durable attachment store, so the WAV survives as long as the attachment does; the provider URL it also returns is temporary. The API key and an attachment backend are the two hard prerequisites; the base URL, model, and default voice have working defaults.

### Minimal configuration

Mount the package and make a DashScope API key available; the tool registers without it and resolves the key at call time.

```yaml
- name: '@deepseek-ai/dsh-tool-tts'
```

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `DASHSCOPE_API_KEY` | Credential reference resolved through the credential seam, falling back to the launch environment |
| `baseURL` | `https://dashscope.aliyuncs.com` | DashScope base URL the generation request is sent to |
| `model` | `qwen3-tts-flash` | Model identifier passed in the synthesis request body |
| `defaultVoice` | `Cherry` | Speaker timbre used when a call omits `voice` |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-tts) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design; the observable behavior is covered in [Use this package](#use-this-package).

### Design philosophy

The package is a thin model-facing adapter over one DashScope endpoint and the attachment seam:

- **Synthesize, download, persist.** `execute` resolves the API key, POSTs a generation request, downloads the signed audio URL, then commits the bytes to `ctx.get('attachments')` as a WAV file. The synthesis call sets `redirect: 'error'` so a credential-bearing request never follows a redirect off the configured host; the download carries no credential and follows redirects.
- **The key resolves through the credential seam.** `apiKeyEnv` is a credential reference: the shared `resolveCredentialValue` helper reads `ctx.credentials` when mounted and otherwise falls back to the launch environment, so the same reference works under a credentials provider or a plain `.env`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, credential resolution, the synthesize and download requests, the attachment commit, and the `generate_speech` registration |
| — | No runtime invariant companion is published; this model-facing adapter has no independent lifecycle stream, and the DashScope API and attachment store own every byte they report. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the package-level contract is not enough.

- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-tts) — the exact `generate_speech` schema.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-tts) — every accepted config field and its source declaration.
- [dsh-credentials](../../credentials/credentials/README.md) — the credential seam that resolves `apiKeyEnv`.
- [dsh-attachment](../../attachment/attachment/README.md) — the attachment store that persists the synthesized WAV.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated [`generate_speech` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-tts): a required `text`, an optional `voice`, and an optional `language` hint. The API key, base URL, model, and default voice are deployment settings, not model arguments.

#### Token effect

Fixed schema cost per request for the one tool; `voice` is a free string and `language` an enumerated hint, so the cost does not vary with configuration.

#### KV Cache effect

Prefix-stable while the definition is unchanged. Plugin lifecycle may invalidate reuse from the first changed schema token.

### Tool result

#### What the model sees

A successful call renders `Generated speech (<voice>) as attachment "<name>" (<bytes> bytes).` followed by `Temporary URL (valid until <expiresAt>): <url>`. A missing key throws `DashScope API key not found. Set <ref> in .env or credentials.`, a missing attachment store throws `Attachment storage is unavailable; cannot persist synthesized audio.`, and provider failures surface as `Qwen TTS request failed (<status>): <body>`, `Qwen TTS returned no audio URL: <message>`, or `Failed to download synthesized audio (<status>).` — each an error tool result the model can read.

#### Token effect

The rendered name, byte count, and URL are data-dependent and resent until compaction; the text argument stays in call history.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the tool is incomplete or needs deployment cooperation. They are current package constraints.

- **A DashScope API key is required at execution** — `generate_speech` resolves `apiKeyEnv` through the credential seam with a launch-environment fallback; with no key the call throws. Registration needs no key, so the tool stays visible before one is configured.
- **An attachment store is required at execution** — the tool commits the downloaded WAV through `ctx.get('attachments')`; with no attachment backend mounted the call throws rather than returning an unpersisted URL.
- **The provider URL is temporary, the attachment is durable** — the returned `url` carries a provider expiry (`expiresAt`), while the saved attachment persists; a deployment that needs long-lived audio relies on the attachment, not the URL.
- **Voices are provider-defined, not a schema enum** — `voice` is a free string the model fills from the description's examples (Cherry, Serena, Ethan, Chelsie); the tool does not validate it against the provider's voice list, so an unsupported name fails at synthesis.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
