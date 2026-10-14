---
description: "The model-facing generate_image tool over the EvoLink Z-Image Turbo API: how deployments supply the API key, base URL, and model, and observe the asynchronous text-to-image tool the model calls."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-gen

English | [中文](README.zh.md)

## Summary

`dsh-tool-image-gen` gives the model a `generate_image` tool that turns a text prompt into one or more images through the EvoLink Z-Image Turbo model. Choose it when an agent needs original artwork, an illustration, or a frame from a description rather than an existing fetched image. The tool creates an asynchronous generation task and polls it every five seconds until the provider reports completion, then returns the image URLs. It needs an EvoLink API key, resolved through the credential seam or the launch environment, and accepts a fixed set of aspect ratios.

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

Load the package in a composition that provides an EvoLink API key; it adds `generate_image` to the toolset so the model can request images from a text prompt.

### When to choose it

Choose this package when the model should produce new images from a description — artwork, illustrations, thumbnails, or video frames — through the EvoLink Z-Image Turbo model. It is a generation tool, not a retrieval tool: it never returns an existing image, and it hands back provider URLs rather than persisted bytes. A deployment that needs the image in the durable attachment store fetches and saves the returned URL separately. The API key is the only hard prerequisite; the base URL and model have working defaults.

### Minimal configuration

Mount the package and make an EvoLink API key available; the tool registers without it and resolves the key at call time.

```yaml
- name: '@deepseek-ai/dsh-tool-image-gen'
```

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `EVOLINK_API_KEY` | Credential reference resolved through the credential seam, falling back to the launch environment |
| `baseURL` | `https://api.evolink.ai` | EvoLink API base URL the create-task and poll requests are sent to |
| `model` | `z-image-turbo` | Model identifier passed in the generation request body |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-image-gen) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design; the observable behavior is covered in [Use this package](#use-this-package).

### Design philosophy

The package is a thin model-facing adapter over one asynchronous EvoLink endpoint pair:

- **Two-phase generation.** `execute` resolves the API key, POSTs a create-task request, then polls the task every five seconds until the provider reports `completed` or `failed`. Both requests set `redirect: 'error'` so a credential-bearing call never follows a redirect off the configured host.
- **The key resolves through the credential seam.** `apiKeyEnv` is a credential reference: the shared `resolveCredentialValue` helper reads `ctx.credentials` when mounted and otherwise falls back to the launch environment, so the same reference works under a credentials provider or a plain `.env`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, credential resolution, the create-task and poll requests, and the `generate_image` registration |
| — | No runtime invariant companion is published; this model-facing adapter has no independent lifecycle stream, and the EvoLink API owns every generation it reports. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the package-level contract is not enough.

- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-gen) — the exact `generate_image` schema.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-image-gen) — every accepted config field and its source declaration.
- [dsh-credentials](../../credentials/credentials/README.md) — the credential seam that resolves `apiKeyEnv`.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated [`generate_image` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-image-gen): a required `prompt` and an optional `size` drawn from a fixed aspect-ratio enum. The API key, base URL, and model are deployment settings, not model arguments.

#### Token effect

Fixed schema cost per request for the one tool; the `size` enum is static, so the cost does not vary with configuration.

#### KV Cache effect

Prefix-stable while the definition is unchanged. Plugin lifecycle may invalidate reuse from the first changed schema token.

### Tool result

#### What the model sees

A successful call renders `Generated <n> image(s):` followed by one URL per line; a completion that returns no URL renders `Image generation completed but returned no URLs.`. A missing key throws `EvoLink API key not found. Set <ref> in .env or credentials.`, and provider failures surface as `EvoLink create task failed (<status>): <body>`, `EvoLink task query failed (<status>): <body>`, or `Image generation failed: <message>` — each an error tool result the model can read.

#### Token effect

The rendered URLs are data-dependent and resent until compaction; the prompt argument stays in call history.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the tool is incomplete or needs deployment cooperation. They are current package constraints.

- **An EvoLink API key is required at execution** — `generate_image` resolves `apiKeyEnv` through the credential seam with a launch-environment fallback; with no key the call throws. Registration needs no key, so the tool stays visible before one is configured.
- **Polling has no independent timeout** — the tool waits five seconds between task queries and loops until the provider reports `completed` or `failed`; only the cooperative abort signal ends a stuck poll, so a hung task holds the call open until the deployment's tool-timeout policy fires.
- **Results are provider URLs, not durable attachments** — the tool returns the URLs the provider gives and neither downloads nor persists the bytes; a deployment that needs the image in the attachment store fetches and saves it separately.
- **Aspect ratios are a fixed enum** — `size` accepts only the nine ratios the provider supports; an arbitrary width and height is not offered to the model.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
