---
description: "构建于 Qwen 语音合成 API 之上的面向模型 generate_speech 工具：部署方如何提供 API 密钥、基础 URL、模型与默认音色，并观察模型调用的文本转语音工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-tts

[English](README.md) | 中文

## 概述

`dsh-tool-tts` 让模型使用 `generate_speech` 工具，通过 Qwen 语音合成模型把文本转为语音。当 agent 需要旁白、解说或语音回复而非文本时选择它。工具合成语音、下载音频，并将其作为 WAV 文件提交到持久附件存储，同时返回附件与提供方的临时 URL。它需要一个 DashScope API 密钥（经凭据 seam 或启动环境解析）以及一个用于持久化字节的附件后端。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在提供 DashScope API 密钥与附件存储的组合中加载本包；它把 `generate_speech` 加入工具集，使模型可以从文本请求语音。

### 何时选择

当模型应从文本生成语音——旁白、解说或语音回复——经由 Qwen 语音合成模型时选择本包。与只交回提供方 URL 的图像生成工具不同，本工具会下载合成的音频并将其提交到持久附件存储，因此 WAV 会随附件一同留存；它同时返回的提供方 URL 则是临时的。API 密钥与附件后端是两项硬前置条件；基础 URL、模型与默认音色都有可用默认值。

### 最小配置

挂载本包并准备好 DashScope API 密钥；工具在没有密钥时也会注册，并在调用时解析密钥。

```yaml
- name: '@deepseek-ai/dsh-tool-tts'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `DASHSCOPE_API_KEY` | 经凭据 seam 解析的凭据引用，回退到启动环境 |
| `baseURL` | `https://dashscope.aliyuncs.com` | 生成请求发送到的 DashScope 基础 URL |
| `model` | `qwen3-tts-flash` | 在合成请求体中传入的模型标识符 |
| `defaultVoice` | `Cherry` | 调用省略 `voice` 时使用的说话人音色 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-tts)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释设计；可观察行为已在[使用本包](#use-this-package)中说明。

### 设计理念

本包是构建在一个 DashScope 端点与附件 seam 之上的精简面向模型适配器：

- **合成、下载、持久化。** `execute` 解析 API 密钥、POST 一个生成请求、下载签名的音频 URL，然后把字节作为 WAV 文件提交到 `ctx.get('attachments')`。合成调用设置 `redirect: 'error'`，因此携带凭据的请求绝不会跟随重定向离开配置的主机；下载不携带凭据，故跟随重定向。
- **密钥经凭据 seam 解析。** `apiKeyEnv` 是一个凭据引用：共享的 `resolveCredentialValue` helper 在挂载时读取 `ctx.credentials`，否则回退到启动环境，因此同一引用在凭据提供方或纯 `.env` 下都可用。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、凭据解析、合成与下载请求、附件提交，以及 `generate_speech` 注册 |
| — | 不发布运行时不变式伴生入口；这个面向模型适配器没有独立的生命周期流，DashScope API 与附件存储拥有它们所报告的每一个字节。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [生成工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-tts)——精确的 `generate_speech` schema。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-tts)——每个受支持配置字段及其源声明。
- [dsh-credentials](../../credentials/credentials/README.zh.md)——解析 `apiKeyEnv` 的凭据 seam。
- [dsh-attachment](../../attachment/attachment/README.zh.md)——持久化合成 WAV 的附件存储。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型会看到生成的 [`generate_speech` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-tts)：一个必填的 `text`、一个可选的 `voice`，以及一个可选的 `language` 提示。API 密钥、基础 URL、模型与默认音色是部署设置，不是模型参数。

#### Token 影响

单个工具每次请求产生固定的 schema token 开销；`voice` 是自由字符串、`language` 是枚举提示，因此开销不随配置变化。

#### KV Cache 影响

只要定义不变，前缀就保持稳定。插件生命周期可能使从第一个变化的 schema token 起的复用失效。

### 工具结果

#### 模型看到的内容

成功调用会渲染 `Generated speech (<voice>) as attachment "<name>" (<bytes> bytes).`，后接 `Temporary URL (valid until <expiresAt>): <url>`。缺失密钥抛出 `DashScope API key not found. Set <ref> in .env or credentials.`，缺失附件存储抛出 `Attachment storage is unavailable; cannot persist synthesized audio.`，提供方失败则表现为 `Qwen TTS request failed (<status>): <body>`、`Qwen TTS returned no audio URL: <message>` 或 `Failed to download synthesized audio (<status>).`——每一个都是模型可读取的错误工具结果。

#### Token 影响

渲染的名称、字节数与 URL 与数据相关，会重复发送直到压缩（compaction）；text 参数保留在调用历史中。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明工具在哪些情况下不完整或需要部署配合。它们是当前包约束。

- **执行时需要 DashScope API 密钥**——`generate_speech` 经凭据 seam 解析 `apiKeyEnv`，并回退到启动环境；没有密钥时调用抛出异常。注册不需要密钥，因此在配置密钥之前工具仍保持可见。
- **执行时需要附件存储**——工具通过 `ctx.get('attachments')` 提交下载的 WAV；没有挂载附件后端时，调用抛出异常，而不是返回未持久化的 URL。
- **提供方 URL 是临时的，附件是持久的**——返回的 `url` 带有提供方过期时间（`expiresAt`），而保存的附件持久留存；需要长期可用音频的部署应依赖附件，而非 URL。
- **音色由提供方定义，不是 schema 枚举**——`voice` 是模型根据描述中的示例（Cherry、Serena、Ethan、Chelsie）填写的自由字符串；工具不会对照提供方音色列表校验它，因此不支持的名称会在合成时失败。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
