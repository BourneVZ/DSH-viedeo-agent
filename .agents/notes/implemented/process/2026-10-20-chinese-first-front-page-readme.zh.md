# Agent Note: 中文优先的仓库主页 README

Status: implemented

[English](2026-10-20-chinese-first-front-page-readme.md) | 中文

## 问题

GitHub 的仓库主页只渲染一个根 README，也不会按访问者的浏览器 locale 在多个文件之间选择，所以主页对所有人只有一种语言。本项目面向中文使用者，文档工作也以中文进行，但 `README.md` 承载的是英文正文、`README.zh.md` 承载的是中文正文：主页打开后落在读者并不使用的语言上。

[双语文档约定](../../../../docs/i18n/README.zh.md)把无后缀的 `.md` 读作配对文档的英文源、`.zh.md` 读作中文对侧，因此把中文正文放进 `README.md` 会与这条约定冲突。

## 决策

`README.md` 承载简体中文主页，`README.en.md` 承载英文主页，两个文件的第三行各放自己的语言切换行。`README.md` 登记在 [scripts/translation-pairing.manifest.json](../../../../scripts/translation-pairing.manifest.json) 的排除项中，根目录的 `README.zh.md` 与 `README.i18n.yaml` 随之删除；配对检查对被排除的源文档禁止存在 `.zh.md` 或一致性记录。`README.en.md` 既不匹配 README 文件名模式，也不匹配根目录配对文档模式，因此这两个主页文件都不在配对语料范围内。

两个主页文件都在相同位置保留 `<a id="run">` 与 `<a id="run-from-source">` 锚点，[双语文档约定](../../../../docs/i18n/README.zh.md)记录了这条排除。

有三项检查按确切路径而不是通配列出根 README，因此它们的清单中原来的 `README.zh.md` 改为 `README.en.md`：[scripts/verify-md-links.ts](../../../../scripts/verify-md-links.ts)、[scripts/verify-md-wrap.ts](../../../../scripts/verify-md-wrap.ts) 与 [scripts/verify-mermaid.ts](../../../../scripts/verify-mermaid.ts)。

指向主页的链接在配对两侧都使用 `README.md` 这一路径。配对检查只对目标位于活跃双语语料内的链接做 locale 归一，因此指向 `README.md` 的链接与指向 `README.en.md` 的链接会按不同字面目标比较，并把该配对的链接序列报成分歧。四篇指向 `README.zh.md` 的中文用户指南改为指向 `README.md`，[文档质量优先受众的 Agent Note](../../proposed/process/2026-08-20-audience-first-documentation-quality.zh.md) 的中文侧同样如此。

## 验证

- `pnpm run verify-translation-pairing` 在 `README.md` 被排除、且磁盘上不存在根 `README.zh.md` 与 `README.i18n.yaml` 时通过。
- `pnpm run verify-md-links` 能解析主页的切换行、`README.en.md` 内的全部相对链接，以及 `docs/user/**` 与 `.agents/notes/**` 中所有指向主页的引用。
- 两个主页文件保持相同的标题层级序列、列表类型与条目数、表格行列数、代码块和链接序列；没有任何检查验证这份相等关系。

## 曾考虑的替代方案

**保留英文 `README.md`，在其顶部加中文提示。** 否决。主页仍以英文开头，正是被报告的问题。

**保留 `README.md` / `README.zh.md` 配对，把中文正文放进 `README.md`。** 否决。检查把无后缀文件当作撰写的英文源，要求 `English | [中文](README.zh.md)` 形式的切换行和指向英文目标的链接序列；中文的 `README.md` 无论如何都需要排除项。

**教配对检查把 `README.en.md` 读作中文 `README.md` 的英文对侧。** 否决。`.zh.md` 后缀是 `translationPairTarget`、`expectedLocalePath` 与切换行模式在整个语料范围内使用的键；为一个文件设置根目录特例会扩散到门禁、其辅助函数和它们的测试。

**英文指南指向 `README.en.md`，中文指南指向 `README.md`。** 否决。语料之外的链接在配对两侧按字面比较，这会让四组文档配对报红。

## 后果

仓库主页以中文打开，英文正文隔一个切换行链接和文件列表里的一行。

主页不再享有配对检查原先施加的漂移检测：改了一种语言不会让任何检查变红，直到有人发现另一侧过期。维持两个文件一致现在是人工工作，与其他不受字数预算约束的散文一样。

英文指南读者点击「从源码运行」链接会到达中文主页，需要使用其第三行的切换链接。另一种做法是把中文读者送到英文页面，按本项目的受众次序，那是更差的取舍。
