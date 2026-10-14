---
description: "构建于 EvoLink Z-Image Turbo API 之上的面向模型 generate_image 工具：部署方如何提供 API key、base URL 与模型，并观察模型调用的异步文本生图工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-image-gen

[English](README.md) | 中文

## 概述

`dsh-tool-image-gen` 为模型提供一个 `generate_image` 工具，通过 EvoLink Z-Image Turbo 模型把文本提示转为一张或多张图像。当 agent 需要根据描述产出原创美术、插画或画面帧，而非取回既有图像时选择它。工具会创建异步生成任务，并每五秒轮询一次直到提供方报告完成，然后返回图像 URL。它需要一个 EvoLink API key（通过 credential seam 或 launch environment 解析），并接受一组固定的宽高比。

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

在提供 EvoLink API key 的组合中加载本包；它把 `generate_image` 加入工具集，使模型可以根据文本提示请求图像。

### 何时选择

当模型应当根据描述产出新图像——美术、插画、缩略图或视频帧——并经由 EvoLink Z-Image Turbo 模型时选择本包。它是生成工具而非取回工具：绝不返回既有图像，且交回的是提供方 URL 而非持久化字节。需要把图像放入持久附件存储的部署，需另行取回并保存返回的 URL。API key 是唯一的硬性前提；base URL 与模型都有可用默认值。

### 最小配置

挂载本包并提供一个 EvoLink API key；工具在无 key 时也会注册，并在调用时解析 key。

```yaml
- name: '@deepseek-ai/dsh-tool-image-gen'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `EVOLINK_API_KEY` | credential 引用，通过 credential seam 解析，并回退到 launch environment |
| `baseURL` | `https://api.evolink.ai` | 创建任务与轮询请求所发往的 EvoLink API base URL |
| `model` | `z-image-turbo` | 在生成请求体中传递的模型标识符 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-image-gen)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释设计；可观察行为已在[使用本包](#use-this-package)中说明。

### 设计理念

本包是一对异步 EvoLink 端点之上一层薄的面向模型适配器：

- **两阶段生成。** `execute` 解析 API key，POST 一个创建任务请求，然后每五秒轮询任务一次，直到提供方报告 `completed` 或 `failed`。两个请求都设置 `redirect: 'error'`，因此携带凭据的调用绝不会跟随重定向离开配置的主机。
- **key 通过 credential seam 解析。** `apiKeyEnv` 是一个 credential 引用：共享的 `resolveCredentialValue` helper 在挂载时读取 `ctx.credentials`，否则回退到 launch environment，因此同一引用在 credentials 提供方或普通 `.env` 下都可用。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、credential 解析、创建任务与轮询请求，以及 `generate_image` 注册 |
| — | 不发布运行时不变式伴生入口；这个面向模型的适配器没有独立的生命周期流，它所报告的每次生成都由 EvoLink API 拥有。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [生成工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-image-gen)——精确的 `generate_image` schema。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-image-gen)——每个受支持配置字段及其源声明。
- [dsh-credentials](../../credentials/credentials/README.zh.md)——解析 `apiKeyEnv` 的 credential seam。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

模型会看到生成的 [`generate_image` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-image-gen)：一个必填的 `prompt` 与一个取自固定宽高比枚举的可选 `size`。API key、base URL 与模型属于部署设置，不是模型参数。

#### Token 影响

单个工具每次请求产生固定的 schema token 开销；`size` 枚举是静态的，因此开销不随配置变化。

#### KV Cache 影响

只要定义不变，前缀就保持稳定。插件生命周期可能使从第一个变化的 schema token 起的复用失效。

### 工具结果

#### 模型看到的内容

成功调用渲染 `Generated <n> image(s):`，随后每行一个 URL；完成但未返回 URL 时渲染 `Image generation completed but returned no URLs.`。缺失 key 会抛出 `EvoLink API key not found. Set <ref> in .env or credentials.`，提供方失败则呈现为 `EvoLink create task failed (<status>): <body>`、`EvoLink task query failed (<status>): <body>` 或 `Image generation failed: <message>`——每一个都是模型可读的错误工具结果。

#### Token 影响

渲染后的 URL 取决于数据，会重复发送直到压缩；prompt 参数保留在调用历史中。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明工具在哪些情况下不完整或需要部署配合。它们是当前包约束。

- **执行时需要 EvoLink API key**——`generate_image` 通过 credential seam 解析 `apiKeyEnv`，并回退到 launch environment；无 key 时调用会抛出。注册不需要 key，因此在配置 key 之前工具仍保持可见。
- **轮询没有独立超时**——工具在每次任务查询之间等待五秒，并循环直到提供方报告 `completed` 或 `failed`；只有协作式中止信号能结束卡住的轮询，因此一个挂起的任务会让调用保持打开，直到部署的工具超时策略触发。
- **结果是提供方 URL，而非持久附件**——工具返回提供方给出的 URL，既不下载也不持久化字节；需要把图像放入附件存储的部署需另行取回并保存。
- **宽高比是固定枚举**——`size` 只接受提供方支持的九种比例；不向模型提供任意宽高。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
