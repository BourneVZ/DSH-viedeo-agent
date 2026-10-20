# Agent Note: Chinese-first front-page README

Status: implemented

English | [中文](2026-10-20-chinese-first-front-page-readme.zh.md)

## Problem

GitHub renders exactly one root README on the repository home page and never picks between files by the visitor's browser language, so the front page has one language regardless of who arrives. This repository is aimed at Chinese-speaking users and its documentation work runs in Chinese, but `README.md` carried the English text and `README.zh.md` carried the Chinese text: the home page opened in the language readers do not work in.

The [bilingual documentation contract](../../../../docs/i18n/README.md) reads the extensionless `.md` as the English source of a pair and `.zh.md` as the Chinese side, so putting Chinese text in `README.md` collides with that convention.

## Decision

`README.md` holds the Simplified Chinese front page and `README.en.md` holds the English one, each with the language switcher on its third line. `README.md` is listed in [scripts/translation-pairing.manifest.json](../../../../scripts/translation-pairing.manifest.json), and the root `README.zh.md` and `README.i18n.yaml` are deleted; the pairing check rejects a `.zh.md` or a consistency record for an excluded source. `README.en.md` matches neither the README nor the paired-root-document filename patterns, so neither front-page file is in the pairing corpus.

Both front-page files keep the `<a id="run">` and `<a id="run-from-source">` anchors at the same positions, and the [bilingual documentation contract](../../../../docs/i18n/README.md) records the exclusion.

Three checks name the root README by exact path instead of by glob, so each list now reads `README.en.md` where it read `README.zh.md`: [scripts/verify-md-links.ts](../../../../scripts/verify-md-links.ts), [scripts/verify-md-wrap.ts](../../../../scripts/verify-md-wrap.ts), and [scripts/verify-mermaid.ts](../../../../scripts/verify-mermaid.ts).

Links to the front page use the path `README.md` on both sides of a pair. The pairing check normalizes only links whose target is inside the active bilingual corpus, so a link to `README.md` and a link to `README.en.md` would compare as different literal targets and report the pair's link sequence as divergent. The four Chinese user-guide pages that pointed at `README.zh.md` now point at `README.md`, together with the Chinese side of [the audience-first documentation quality Agent Note](../../proposed/process/2026-08-20-audience-first-documentation-quality.md).

## Verification

- `pnpm run verify-translation-pairing` passes with `README.md` excluded and no root `README.zh.md` or `README.i18n.yaml` on disk.
- `pnpm run verify-md-links` resolves the front-page switchers, every relative link inside `README.en.md`, and all references to the front page from `docs/user/**` and `.agents/notes/**`.
- The two front-page files carry the same heading depths, list kinds and item counts, table dimensions, code blocks, and link sequence; nothing verifies that equality.

## Alternatives considered

**Keep `README.md` English and add a Chinese notice at its top.** Rejected. The home page still opens in English, which is the reported problem.

**Keep the `README.md` / `README.zh.md` pair and put the Chinese text in `README.md`.** Rejected. The check treats the extensionless file as the authored English source, so it demands the `English | [中文](README.zh.md)` switcher form and an English-target link sequence; a Chinese `README.md` needs an exclusion either way.

**Teach the pairing check to read `README.en.md` as the English side of a Chinese `README.md`.** Rejected. The `.zh.md` suffix is the corpus-wide key in `translationPairTarget`, `expectedLocalePath`, and the switcher pattern, so a root-only exception spreads through the gate, its helpers, and their specs to serve one file.

**Point English guides at `README.en.md` and Chinese guides at `README.md`.** Rejected. Links outside the active corpus are compared literally between the two sides of a pair, so four documentation pairs would go red.

## Consequences

The repository home page opens in Chinese, and the English text stays one switcher link and one file-listing row away.

The front page no longer has the drift check the pairing gate ran on it: editing one language does not turn anything red until a person notices the other language is stale. Keeping the two files aligned is now manual work, the same way any unbudgeted prose is.

An English guide reader who follows a run-from-source link lands on the Chinese front page and uses its line-3 switcher. The alternative would have sent Chinese readers to an English page, which this project's audience order makes the worse trade.
