# Agent Note: Fork attribution, license map, and legal exposure register

Status: proposed

English | [中文](2026-10-20-fork-attribution-and-license-map.zh.md)

## Problem

This repository presents itself as its own project — the video-production agent — while the checkout it came from carried three inherited statements that no longer hold. The README front door listed DeepSeek's community channels as places to get help. Nothing recorded which files are DeepSeek's, which are this repository's, and which base files were edited, while the README asserted the underlying harness was unchanged; `git log` shows it was edited in [packages/client/ui-layout/src/client/AppFrame.tsx](../../../../packages/client/ui-layout/src/client/AppFrame.tsx) and elsewhere. And the terms that actually apply to the work — MIT for the base, BSD-3-Clause for `native/system/`, Apache-2.0 for `hyperframes`, the font assets the web build copies — were named only inside a generated dependency table.

Each gap is a distinct exposure: routing users to another party's support channels reads as official endorsement and strands them; a provenance claim that overstates separation from the base misrepresents the work; and MIT, BSD-3-Clause, Apache-2.0, and the font licenses each carry attribution duties that attach when artifacts are distributed, not when code is written.

## Proposal

1. **The front door describes only this repository.** The README pair carries no DeepSeek community entry point: no Discussions link, no Discord invite, no WeCom membership form, no `dsh-plugin` topic pitch. Those channels stay in documents about the base project, where they are the right address. The names "DeepSeek" and "DeepSeek Harness" stay, because naming the source truthfully is what [BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md) permits.
2. **`NOTICE` owns provenance.** Root `NOTICE` states the license layers, the packages original to this repository, the base files this repository modified, the trademark and non-endorsement statement, and the distribution gaps still open. `LICENSE` stays the verbatim MIT text with DeepSeek's copyright line: a license text is never edited to add a fork's claim.
3. **The README states obligations where the reader can act on them.** The Safety section names the paid API usage, the two endpoints that receive narration text and image prompts, the fact that rendered MP4 output carries no AI-content label, and who owns rights in the material. The License section states the layering and links `NOTICE`, `THIRD_PARTY_NOTICES.md`, and `pnpm-lock.yaml`.
4. **Open exposure keeps an owner in this note.** The register below is the single place that tracks what a release still has to settle.

## Legal exposure register

| Item | Verified current state | Closing action |
| --- | --- | --- |
| npm namespace | 273 workspace manifests, including the three packages this repository added, are publish-ready under `@deepseek-ai` and declare `repository.url` as the upstream repository | Set `private: true` on the additions, or move the whole scope, before any publish; a fork has no right to that namespace |
| Provider attribution | Every model request sends `User-Agent: deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)` from [packages/llm/llm/src/attribution.ts](../../../../packages/llm/llm/src/attribution.ts) | Pass this project's own `AppIdentity` to `attributionHeaders`, so DeepSeek's traffic analytics are not credited to the upstream app |
| License texts in artifacts | `THIRD_PARTY_NOTICES.md` names each dependency's license but carries no license text, and the web build copies `katex/dist` assets, including font files, into `apps/web/dist/assets/` with no notice | Bundle the per-package license text with any built artifact before distributing it; check the upstream font terms separately from the package MIT text |
| Generated-content labels | `video_render` writes no visible label and no label metadata | Decide whether the renderer emits an explicit corner mark and the metadata fields its jurisdiction requires, and whether that is default-on |
| Contribution terms | `CONTRIBUTING.md` is the base's text and says the base accepts no external pull requests; no inbound license grant exists in this repository | State whether this repository takes contributions, and if it does, record that contributions arrive under MIT |

## Alternatives considered

- **Keep the upstream links under a heading that says "upstream".** Rejected. A README is where users look for how to reach the people who run the thing they installed, and a fork that hands out DeepSeek's Discord invite and WeCom form is claiming their attention as its own.
- **A second license file for the video layer.** Rejected. MIT already covers the additions, and a second text makes it unclear which terms govern a file that imports base types. `NOTICE` records authorship instead, and gains a named holder only if the project declares one.
- **Rewrite `LICENSE` to name this repository as the copyright holder.** Rejected as unlawful: MIT's copyright and permission notice must travel in every copy.
- **Re-scope every package now.** Rejected for this change. It touches every manifest, peer dependency, and `cordis.yml` row at once; the publish guard above is the cheap control until a release is planned.

## Acceptance criteria

- The README pair contains no DeepSeek community entry point and no claim that the base is untouched.
- Root `NOTICE` names each license layer, lists the modified base files, carries the trademark and non-endorsement statement, and every path it cites resolves.
- `pnpm run test:docs` passes, with the README pair re-recorded after the change.
- Each register row above has a recorded decision before the repository is published, hosted, or distributed as a built artifact; rows close here, and this note moves to `implemented/` when none is open.

## Risks

`NOTICE` lists modified base files from `git log`, so it goes stale whenever a base file is edited again; keep it current in the same change, or drop that section and let `git log` alone carry the list. Nothing here is legal advice: the register reads published license texts and current rules against this checkout, and a distribution decision — publishing to npm, hosting the workbench, or releasing videos to the public — needs review by someone qualified for the jurisdiction that applies.
