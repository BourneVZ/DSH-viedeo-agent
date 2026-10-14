# Agent Note: Hyperframes 视频工具转正为 release 包

Status: implemented

[English](2026-10-14-hyperframes-tool-promoted-to-release.md) | 中文

## 问题

Hyperframes 视频工具（`video_lint`、`video_snapshot`、`video_render`）此前以 `@deepseek-ai/dsh-experimental-tool-hyperframes` 之名发布于 `packages/experimental/` 下，并标记 `private: true`。video preset 组成了一个依赖这些工具的视频制作 agent，但 release 包不得依赖 experimental 包，因此转正后的视频界面无法指名其 agent 所需的工具包。视频 agent 使用的三个媒体工具——Hyperframes、图像生成与语音合成——也不在生成工具目录的 boot manifest 中，因此它们面向模型的 schema 从未被采集，其包 README 也没有可链接的目录 anchor。

## 决策

`@deepseek-ai/dsh-tool-hyperframes` 是位于 `packages/web/tool-hyperframes` 的 release 包：experimental 名称与 `private: true` 已移除，`publishConfig.access` 为 `public`，三个工具保留其名称与行为。三个媒体工具包——`tool-hyperframes`、`tool-image-gen` 与 `tool-tts`——都注册进 `gen-tool-catalog` 的 boot manifest，因此生成目录会在 boot 时采集每个工具的 schema，且每个 README 链接其 `#deepseek-aidsh-tool-*` anchor。图像生成与语音合成通过 `dsh-credentials` 中共享的 `credentialRefSchema` 与 `resolveCredentialValue` helper 解析其提供方 API 密钥，并去掉各自的 `dsh-launch-environment` 依赖，因此凭据解析只有一个所有者，而非逐包回退。

## 考虑过的替代方案

**让 Hyperframes 保持 experimental，并让 video preset 照常依赖它。** 该方案落选，因为 release/experimental 边界是强制的：已发布的包不得引入私有原型，因此在工具仍为 experimental 时发布视频界面，要么破坏依赖规则，要么把工具挡在 preset 所需的 release 之外。

**把媒体工具排除在生成目录之外。** 该方案落选，因为 model-experience README 门禁要求 tool-schema 条目链接一个真实存在的目录 anchor，而未采集的包没有 anchor；这些工具的 schema 也会对把目录当作真源来读的人保持不可见。

**保留逐包的 launch-environment 凭据回退。** 该方案落选，因为图像生成与语音合成各自手写了相同的"先读凭据、否则读环境"解析；一对共享 helper 消除了重复与多余的依赖边。

## 影响

Hyperframes 现在是受 release 稳定性约束的公开 API，因此其工具名称、schema 与行为是承诺，而非原型的自由。工具目录会多 boot 三个包以采集其 schema。媒体工具的凭据解析在 `dsh-credentials` 中只有单一所有者。三个媒体工具包各自带一份双语 package-reference README 与 Model Experience 区段，README 门禁现在强制执行这一点。
