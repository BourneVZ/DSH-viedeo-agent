---
description: "The video-production bundle: the patch layer over dsh-web-app that mounts the video project host routes and shell mode and defaults a new session to the video preset, for users composing or customizing a profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-video-app

English | [中文](README.zh.md)

## Summary

This bundle turns a web profile into the video-production surface. It is the patch layer over `dsh-web-app` that mounts the video project host routes and the video shell mode, and defaults a newly created session to the `video` agent preset. The shipped `video` profile already includes it, after `dsh-base` and `dsh-web-app`; you add it to your own profile by naming it in that profile's bundle list and remove it the same way. It is a patch-list carrier, not a library to import or a single plugin to mount.

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

### Install into a profile

The shipped `video` profile already names this bundle: its template lists `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and `@deepseek-ai/dsh-video-app` in that order, so `dsh --profile video "your task"` activates the layer with no further step. In-box bundles resolve from the dsh installation, not a registry, so a custom profile adds this one by naming it in its `package.json` `dsh.profile.bundles` list, after the layers it patches over:

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-video-app"]
    }
  }
}
```

`dsh plugin --profile <name> add @deepseek-ai/dsh-video-app` is the out-of-tree path: it forwards to `pnpm add`, which resolves against the npm registry. Because this package ships inside the dsh installation and is not published there, that command fails with a registry 404 from a source checkout — name the bundle in the profile's bundle list instead. The reconcile step activates a dependency only when it resolves to a package declaring `dsh.bundle.patch`; this package declares it, so a profile that names it layers its patch over the earlier bundles, while a package without the declaration installs as a plain dependency and activates no layer.

### What you get

The layer adds two rows and one override. [`dsh-host-video-project`](../../host/video-project/README.md) serves the authenticated `/api/video` routes; [`dsh-client-ui-video`](../../client/ui-video/README.md) draws the top-bar mode switch and the roster and preview panes; and the `agent-presets` row defaults a newly created session to the `video` preset. Each row's own package owns that row's behavior.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a static patch document: one `insert` list plus one id-targeted override, applied over the empty profile root after `dsh-base` and `dsh-web-app`. It mounts no service, emits no events, and holds no mutable state; each inserted row's package owns that row's behavior and invariants.

A patch replaces the targeted row's whole `config` rather than merging into it, so the `agent-presets` row restates the single key it owns (`default: video`). The override lands because the loader indexes rows a prior `insert` added, so a later layer can target `agent-presets` by id even though `dsh-web-app` inserted it. The default only fills an unset choice: a session already pinned to a preset keeps it, and a default the user stored through the settings surface still wins over this row. The profile's own `cordis.patch.yml` and any `--patch` overlays apply after this layer.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The bundle substance: the two inserted rows and the preset-default override, with per-row rationale |
| [`src/index.ts`](src/index.ts) | Package entry; carries no runtime API |
| [`tests/video-app.spec.ts`](tests/video-app.spec.ts) | Manifest declaration, insert-row, and three-layer composition checks |

### Invariant ownership

No invariant companion is published because the package is a static patch-list carrier: each inserted row's package owns that row's invariants, and the bundle owns no mutable relation to check.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Bundle package map](../README.md) — the installable profile layers and how they stack.
- [app-boot profile section](../../boot/app-boot/README.md) — how profiles are resolved, layered, and customized.
- [`dsh-host-video-project`](../../host/video-project/README.md) — the host routes this layer mounts.
- [`dsh-client-ui-video`](../../client/ui-video/README.md) — the browser surface this layer mounts.
- [Generated composition graph](../../../apps/cli/composition.md) — the exact plugin set each shipped profile uses.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through each inserted row's package, which owns that row's model-facing behavior.

#### KV Cache effect

The bundle itself adds no request prefix; each inserted row's package owns any cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits tell you when the layer needs care or where an override must go; they are current package constraints, not a task backlog.

- **Overrides replace whole settings blocks.** The `agent-presets` row replaces that row's entire configuration, so a profile that needs other preset settings must restate them in its own patch; nothing merges automatically.
- **The preset default only fills an unset choice.** A session already pinned to a preset keeps it, and a default the user stored through the settings surface wins over this row.
- **In-box, not registry-installable.** `dsh plugin add` resolves against the npm registry and 404s for this unpublished in-box package; activate it by naming it in a profile's bundle list.
- **It patches over the web layer.** The bundle assumes `dsh-web-app` is already in the profile; naming it without that layer leaves the video rows mounting into a composition that lacks the web connection and workspace services they read.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
