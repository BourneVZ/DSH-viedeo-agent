---
description: "在已注册工作区下发现 script.json 视频项目，并通过受认证的 /api/video 路由提供其分镜时间轴与媒体字节，供接线或调试视频 shell 模式数据面的操作者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-video-project

[English](README.md) | 中文

## 概述

浏览器视频界面读取本包提供的三条受认证路由。它在已注册工作区下找出每个含 `script.json` 的目录，将每个分镜的图片、缩略图与旁白音频相对项目目录解析，定位最新的已渲染 `.mp4`，并以 HTTP `Range` 支持流式传输媒体，使 `<video>` 元素能够拖动定位。当你挂载视频 shell 模式时选择它；它不注册 Cordis 服务，也不注册面向模型的工具，浏览器半侧是其唯一消费者。它只在已注册工作区内读取，且单次仅提供一个不超过字节上限的文件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 web 组合中将它与 connection、filesystem、workspace 服务并列挂载；视频 shell 模式的窗格随后通过 `/api/video` 读取它。

### 何时选择它

当某个 profile 提供视频 shell 模式并需要其项目列表、分镜时间轴与媒体字节时，选择本包；它是 [`dsh-client-ui-video`](../../client/ui-video/README.zh.md) 的宿主半侧，并随 [`video-app` 组合包](../../bundle/video-app/README.zh.md) 一同发布。在没有浏览器视频界面的 profile 中应避免使用它：它注册的路由无人读取。它没有独立的退路——不含它的组合只是不提供任何 `/api/video` 路由。

### 最小配置

可用的最小挂载，写成一条 `cordis.yml` 配置项：

```yaml
- id: video-project
  name: '@deepseek-ai/dsh-host-video-project'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `scanDepth` | `3` | 在每个工作区根下查找 `script.json` 时遍历的目录层数 |
| `maxMediaBytes` | `536870912` | 单次 `/api/video/media` 响应的含端点字节上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-video-project)是每个受支持字段的详尽来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

插件在一个 `ctx.effect` 内占用三条路由，因此释放其 fiber 会一并移除这三条。视频项目是任何含 `script.json` 的目录——即 video preset 的 persona 要求 agent 写出的文件。发现过程对每个已注册工作区根做广度优先遍历至 `scanDepth`，在遇到的第一个 `script.json` 处停止下探，跳过点目录与依赖树（`node_modules`、`dist` 等），并将单次遍历限制在 20,000 个目录。

`script.json` 以容错方式读取：persona 固定了其必需内容但未固定键的拼写，因此每个字段都接受中英文别名，未声明时长的分镜读取其开始与结束偏移所夹的区间，不是对象或不含分镜列表的文件会被报告为解析错误而非空项目——项目仍会列出，以便用户查看并修复。列表路由仅返回新近度、分镜数与是否存在渲染；项目路由将每个声明的资源相对项目目录解析，并只保留作为常规文件存在的路径。新近度取自 `node:fs/promises`，因为 `FileSystem` seam 不报告时间戳；执行世界不是宿主的后端会得到 `0` 并排在最后。

媒体路由通过 `FileSystem.readByteRange` 以 1 MiB 分块流式传输一个字节窗口，并遵循单个 HTTP `Range`——这是浏览器 `<video>` 拖动定位所需的最小支持。访问被限制在已注册工作区内、仅限常规文件、且不超过 `maxMediaBytes`；Connection 服务在处理器运行前认证请求，而 `sandbox; default-src 'none'` 策略阻止被提供的 HTML 或 SVG 文件在 API 源上运行脚本。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema 与三路由 effect |
| [`src/discovery.ts`](src/discovery.ts) | 工作区遍历、渲染搜索与资源解析 |
| [`src/script.ts`](src/script.ts) | 带双语键别名的容错 `script.json` 读取器 |
| [`src/media.ts`](src/media.ts) | 支持 Range 的受认证字节服务 |
| [`src/types.ts`](src/types.ts) | 三条路由的线路类型 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-client-ui-video`](../../client/ui-video/README.zh.md)——读取这些路由的浏览器半侧。
- [`dsh-video-app` 组合包](../../bundle/video-app/README.zh.md)——挂载两个半侧的 profile 层。
- [工作区子系统](../../../docs/subsystems/workspace.zh.md)——发现过程遍历的工作区根。
- [HTTP 服务器子系统](../../../docs/subsystems/web-server.zh.md)——路由所注册于其上的传输。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包向浏览器提供 HTTP 路由，不注册任何模型可见的 prompt、消息、schema、流或工具。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

这些限制告诉你数据面在何处需要留意；它们是本包当前的约束，而非任务清单。

- **发现受深度与访问数上限约束。** 位于工作区根下超过 `scanDepth` 层、或在单次遍历中超出 20,000 目录上限的项目不会被发现；对更深的树请调高 `scanDepth`。
- **新近度需要宿主可见的文件系统。** 目录修改时间取自 `node:fs/promises`；执行世界不是宿主的沙箱或远程后端会得到 `0`，其项目排在最后。
- **媒体受围栏与上限约束。** 位于每个已注册工作区之外的路径返回 `403`，非常规文件返回 `403`，超过 `maxMediaBytes` 的文件返回 `413`；对更大的渲染请调高上限。
- **分镜键按别名匹配，而非 schema 校验。** 字段拼写落在别名列表之外的 `script.json` 会读作空文本；文件仍会列出，并在不含分镜数组时附带解析错误。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

不发布不变量伴生包，因为这些路由在每次请求时都重新读取文件系统、不缓存任何项目状态，因此不存在会发生分歧的第二份观测。

</details>
