# Agent Note: 衍生归属、许可分层地图与法律风险登记

Status: proposed

[English](2026-10-20-fork-attribution-and-license-map.md) | 中文

## 问题

本仓库以自己的项目身份面世——视频制作 Agent——但它的 checkout 继承了三项已经不再成立的表述。README 首页把 DeepSeek 的社群渠道列成求助入口。哪些文件属于 DeepSeek、哪些属于本仓库、基底的哪些文件被改过，没有任何记录说明，而 README 却断言底层 harness 未被改动；`git log` 显示它被改动过，例如 [packages/client/ui-layout/src/client/AppFrame.tsx](../../../../packages/client/ui-layout/src/client/AppFrame.tsx)。而真正适用于这份作品的条款——基底 MIT、`native/system/` 的 BSD-3-Clause、`hyperframes` 的 Apache-2.0、Web 构建复制的字体许可——只在一张生成的依赖表里被提名。

每一处缺口都是不同性质的风险：把用户引向他人的支持渠道，会被读成官方背书并让用户无处求解；夸大与基底的分离度，是对来源的失实陈述；MIT、BSD-3-Clause、Apache-2.0 与字体许可各自的署名义务，附着在**分发产物**上，而不是写在代码里的那一刻。

## 提案

1. **首页只描述本仓库。** README 双语侧不再出现任何 DeepSeek 社群入口：没有 Discussions 链接、没有 Discord 邀请、没有企微入群问卷、没有 `dsh-plugin` 话题推荐。这些渠道留在介绍基底项目的文档里，那里才是它们该出现的地方。「DeepSeek」与「DeepSeek Harness」两个名称保留，因为如实指明来源正是 [BRAND_GUIDELINES.zh.md](../../../../BRAND_GUIDELINES.zh.md) 允许的用法。
2. **`NOTICE` 拥有来源记录。** 根目录 `NOTICE` 写明许可分层、本仓库原创的包、被改动过的基底文件、商标与非背书声明，以及尚未闭合的分发缺口。`LICENSE` 保持逐字的 MIT 文本与 DeepSeek 的版权行：许可文本绝不为了加入衍生方的声明而修改。
3. **README 在读者能够行动的位置写明义务。** 安全一节点明付费 API、接收旁白文本与图片提示词的两个端点、渲染出的 MP4 不含 AI 生成标识这一事实，以及素材权利的归属责任人。许可证一节写明分层，并链接 `NOTICE`、`THIRD_PARTY_NOTICES.md` 与 `pnpm-lock.yaml`。
4. **未闭合的风险在本 Note 里保留责任人。** 下面的登记表是发布前尚需处理事项的唯一记录位置。

## 法律风险登记

| 事项 | 已核实的当前状态 | 闭合动作 |
| --- | --- | --- |
| npm 命名空间 | 273 份 workspace manifest（含本仓库新增的三个包）处于可发布状态并挂在 `@deepseek-ai` 下，且声明 `repository.url` 指向上游仓库 | 任何发布之前，给新增包设置 `private: true`，或整体改用自有 scope；衍生项目对他人命名空间没有发布权 |
| 请求归属 | 每次模型请求都从 [packages/llm/llm/src/attribution.ts](../../../../packages/llm/llm/src/attribution.ts) 发出 `User-Agent: deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)` | 向 `attributionHeaders` 传入本项目自己的 `AppIdentity`，不要把流量统计记到上游应用名下 |
| 产物内的许可文本 | `THIRD_PARTY_NOTICES.md` 只列依赖许可名称、不含任何许可文本，而 Web 构建把 `katex/dist` 资源（含字体文件）复制进 `apps/web/dist/assets/` 且未附带任何声明 | 分发任何构建产物之前，随包附带各依赖的许可文本；字体自身的上游许可要脱离包内 MIT 文本单独核对 |
| 生成内容标识 | `video_render` 既不写可见标识，也不写标识元数据 | 决定渲染器是否输出显式角标与其法域要求的元数据字段，以及默认开启还是关闭 |
| 贡献条款 | `CONTRIBUTING.md` 是基底的文本，写明基底当前不接收外部 PR；本仓库没有任何入站授权声明 | 明确本仓库是否接受贡献；若接受，写明贡献以 MIT 条款入站 |

## 曾考虑的替代方案

- **保留上游链接，只在标题上注明「上游」。** 否决。README 是用户寻找「谁在我装的这个东西」的去处，一个把 DeepSeek 的 Discord 邀请和企微问卷递出去的衍生项目，是在把别人的注意力当成自己的。
- **给视频层单独写一份许可文本。** 否决。MIT 已经覆盖新增部分，第二份文本只会让「引用了基底类型的文件按哪份条款」变成问题。作者身份改由 `NOTICE` 记录，只在项目指明权利人时才补一行具名版权。
- **改写 `LICENSE`，把本仓库写成版权人。** 否决，且违法：MIT 的版权声明与许可声明必须随每一份副本一起传递。
- **现在就整体更换包 scope。** 本次不采纳。它要同时改动每一份 manifest、每一个 peer 依赖和每一行 `cordis.yml`；在规划发布之前，上面那条发布防护就是成本最低的控制。

## 验收标准

- README 双语侧不含任何 DeepSeek 社群入口，也不含「基底未被改动」的断言。
- 根 `NOTICE` 写明每一层许可、列出被改动的基底文件、承载商标与非背书声明，且它引用的每个路径都能解析。
- `pnpm run test:docs` 通过，且改动之后重新记录了 README 配对。
- 在仓库被发布、被托管、或以构建产物形式分发之前，上面每一行登记事项都要有记录在案的决策；事项在此关闭，全部关闭后本 Note 移入 `implemented/`。

## 风险

`NOTICE` 的基底改动清单取自 `git log`，因此每次再改动基底文件就会失配；要么在同一次改动里更新它，要么删掉那一节、完全交由 `git log` 承担。本文不是法律意见：登记表是把已公布的许可文本与现行规则对照这份 checkout 得到的读后结论，而任何分发决定——发布到 npm、托管工作台、或向公众发布成片——都需要由具备相应法域资格的人复核。
