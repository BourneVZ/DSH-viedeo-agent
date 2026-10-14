---
description: "面向模型的 Hyperframes 视频工具（video_lint、video_snapshot、video_render）：部署方如何把本包指向 Hyperframes CLI，并观察模型在合成上驱动的 lint、预览与渲染工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-hyperframes

[English](README.md) | 中文

## 概述

`dsh-tool-hyperframes` 为模型提供三个作用于 Hyperframes 视频项目的工具：`video_lint` 校验合成，`video_snapshot` 截取关键帧并最多将九张拼成网格用于视觉检查，`video_render` 产出最终 MP4。当 agent 编写 Hyperframes 合成并需要在循环内校验、预览与渲染时选择它。每个工具都调用 Hyperframes CLI，因此 CLI 必须可达；网格拼合还需要 ImageMagick。每个工具接受一个项目目录并返回结构化摘要。

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

在赋予模型一个 Hyperframes 项目目录的组合中加载本包；它把 `video_lint`、`video_snapshot` 与 `video_render` 加入工具集，并向系统提示词加入一个指引区段。

### 何时选择

当模型端到端驱动 Hyperframes 创作时选择本包：lint 合成的结构与时序错误，截取代表性帧以确认画面正确，然后渲染 MP4。它把每个操作都委托给 Hyperframes CLI，因此适合已经提供 CLI、并希望模型作用于项目目录而非通过 shell 调用 CLI 的部署。没有逐工具的启用配置；挂载本包即公开全部三个。

### 最小配置

挂载本包；三个工具以默认 CLI 查找注册。

```yaml
- name: '@deepseek-ai/dsh-tool-hyperframes'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `hyperframesCliPath` | `hyperframes` | 每次 lint、snapshot 与 render 调用所执行的可执行文件；当 CLI 不在 `PATH` 上时设为绝对路径 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-hyperframes)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释设计；可观察行为已在[使用本包](#use-this-package)中说明。

### 设计理念

本包是 Hyperframes CLI 之上一层薄的面向模型适配器：

- **CLI 拥有每个操作。** 每个工具解析项目路径，构建 CLI 参数向量，以项目目录为工作目录 spawn 配置的可执行文件，并转发协作式中止信号。组合解析、渲染或帧截取都不在本包内发生。
- **输出被收窄为结构化结果。** Lint 在可解析时读取 `--json` 输出，否则回退到面向行的文本解析；snapshot 扫描 CLI 输出中已写入的 PNG 路径；render 确认输出文件存在并测量时长与大小。无法识别的严重级别被视为错误，因此问题绝不会被静默降级。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、系统提示词区段、三个工具注册、CLI 调用与输出解析 |
| — | 不发布运行时不变式伴生入口；这个面向模型的适配器没有独立的生命周期流，它所报告的每个操作都由 CLI 拥有。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [生成工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-hyperframes)——精确的 `video_lint`、`video_snapshot` 与 `video_render` schema。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-hyperframes)——每个受支持配置字段及其源声明。
- [web 包映射](../README.zh.md)——本包与之并列交付的能力族。

-----

<a id="model-experience"></a>
## 模型体验

### 系统提示词

#### 模型看到的内容

本包贡献一个工具指引区段，独立于工具 schema 注册。

##### Hyperframes 工具指引

```markdown
Use video_lint to validate Hyperframes projects before rendering. Use video_snapshot for visual verification at specific time points. Use video_render to produce the final MP4 output.
```

#### Token 影响

挂载本包期间每次请求产生固定的指引 token 开销；它不随调用次数增长。

#### KV Cache 影响

只要区段文本不变，前缀就保持稳定。插件生命周期可能使从第一个变化的提示词区段起的复用失效。

### 工具 schema

#### 模型看到的内容

模型会看到生成的 [`video_lint`、`video_snapshot` 与 `video_render` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-hyperframes)。CLI 路径属于部署设置，不是模型参数。

#### Token 影响

三个工具每次请求产生固定的 schema token 开销；没有配置可禁用单个工具。

#### KV Cache 影响

只要定义不变，前缀就保持稳定。插件生命周期可能使从第一个变化的 schema token 起的复用失效。

### 工具结果

#### 模型看到的内容

每个工具都将其 `summary` 字段渲染为结果文本——例如 `Lint passed with 0 warning(s)`、`Captured 3 snapshot(s) and composed grid at <path>` 或 `Rendered to <path> (12MB, 4.3s)`。失败时渲染 `Render failed: <stderr>`、`Snapshot failed: <stderr>` 或 `Failed to execute <op>: <message>`；无效的项目路径会在任何 CLI 调用之前抛出。

#### Token 影响

渲染后的摘要是一行短文本，会重复发送直到压缩；结构化结果还额外携带问题列表、快照路径或渲染元数据。

#### KV Cache 影响

仅追加；新可见内容位于可复用请求前缀之后，不会使现有 KV Cache 条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明工具在哪些情况下不完整或需要部署配合。它们是当前包约束。

- **必须安装并可达 Hyperframes CLI**——每个操作都会 spawn `hyperframesCliPath`；缺失的可执行文件会以失败的工具结果呈现，本包绝不内置或下载 CLI。
- **快照网格拼合需要 ImageMagick**——`video_snapshot` 通过 `magick montage` 拼合多帧网格；当 ImageMagick 缺失时，单张 PNG 仍会被截取，只是省略 `grid_path`。
- **渲染会阻塞直到 CLI 退出**——`video_render` 不流式上报进度；调用只在渲染完成或中止信号触发时才结算，因此一次长渲染会让工具调用保持打开。
- **Lint 输出解析是尽力而为**——工具优先使用 `hyperframes lint --json`，并回退到面向行的 `[severity] message at location` 解析；超出这两种形状的 CLI 输出会产生空的问题列表而非错误。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
