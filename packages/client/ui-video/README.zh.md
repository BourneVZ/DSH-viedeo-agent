---
description: "web GUI 的视频制作 shell 模式：一个顶栏切换组件，把项目列表与分镜预览排列在真实对话界面旁，供组合或调试浏览器视频界面的用户使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video

[English](README.md) | 中文

## 概述

本包为 web GUI 增加一个视频制作模式。选中其顶栏切换组件后，默认三栏框架被替换为：左侧项目列表、中间分镜预览、右侧已发布的对话界面——即真实的会话头部、转录与输入器，含气泡 Markdown 与可折叠的中间步骤，而非对其的重新搭建。列表列出宿主发现的每个 `script.json` 项目；中间播放某项目的最新渲染，或在渲染存在前展示其分镜序列。将它与提供数据的 [`dsh-host-video-project`](../../host/video-project/README.zh.md) 一同挂载。

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

在 web 组合中将本插件与 [`dsh-host-video-project`](../../host/video-project/README.zh.md) 并列挂载；这一对在两条 cordis.yml 配置项中组成完整界面，且本配置项不接受任何 config。只有挂载本插件时顶栏才出现模式切换组件，且视频模式只在 layout 服务存在后才出现。

### 预期效果

切换组件在默认布局与 `video` 模式之间选择。在视频模式下，列表栏按最新在前列出发现的项目，每项含标题、分镜数、渲染徽章与更新时间；选中某项即驱动中间窗格。当项目存在渲染时，中间通过宿主支持 Range 的媒体路由播放最新的 `.mp4`；否则在按脚本顺序排列的分镜序列上方显示一条"未渲染"提示——每个分镜含缩略图（或生成的图片，或缺失静态图占位）、视觉类型徽章、时长、描述与旁白。右栏是框架自身的对话界面，因此在其中输入视频制作请求会运行该会话的 agent preset，并以与默认布局完全一致的方式渲染。两个窗格共享一个 roster 控制器，每五秒轮询宿主一次，因此 agent 写入项目目录的分镜、旁白音频与渲染无需刷新即可出现。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

node 半侧是一个空 `apply`，用以把插件保留在宿主 roster 上；浏览器半侧通过 `exports["./client"]` 发布，由 `package.json` 中的 `dsh.client` 声明发现（inject `locale`、`ui-layout`、`ui-renderer`；platform `web`）。

浏览器 `apply` 注册 `video` 语言词典、一个通过 `ctx.layout.registerShellMode` 注册的替代 shell 模式，以及 `shell.mode.pane` keyed slot 上的两个窗格。模式 spec 固定 `columns: '260px minmax(0, 1fr) 400px'` 与三个窗格——`projects`、`preview` 与 `{ kind: 'conversation' }`——因此框架在不知道视频项目为何物的情况下绘制切换组件并排布窗格；conversation 窗格重新挂载框架自身的 session-maybe 界面，而非其副本。label 是一个按渲染解析的 thunk，因此标签页跟随当前语言而无需重新注册。

一个 `VideoProjectsController`（[`src/client/video-store.ts`](src/client/video-store.ts)）拥有两个窗格共享的 roster 与 detail 快照，因此左侧的选择即中间所渲染的内容。它通过同源 `fetch` 读取宿主的 `/api/video/*` 路由——连接层已为浏览器完成认证——并按间隔轮询，因为没有转发事件会通告 `script.json` 的变化；进行中的轮询不会被重复叠加。每个窗格通过 inject 的 `hooks` 隔间接收该 store，而窗格 slot 用 `ctx.slots.inject` 填充，因为框架只在模式主体首次渲染时才声明它。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | node 半侧：空 `apply`，把插件保留在宿主 roster 上 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器半侧：语言、shell 模式与两个窗格注册 |
| [`src/client/video-store.ts`](src/client/video-store.ts) | roster 控制器、宿主传输与轮询 |
| [`src/client/VideoProjectsPane.tsx`](src/client/VideoProjectsPane.tsx) | 左侧列表窗格 |
| [`src/client/VideoPreviewPane.tsx`](src/client/VideoPreviewPane.tsx) | 中间播放器与分镜序列窗格 |
| [`src/client/locales.ts`](src/client/locales.ts) | 双语 `video` 命名空间词典 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-host-video-project`](../../host/video-project/README.zh.md)——本界面读取的宿主路由。
- [`dsh-video-app` 组合包](../../bundle/video-app/README.zh.md)——挂载两个半侧的 profile 层。
- [`dsh-client-ui-layout`](../ui-layout/README.zh.md)——本包注册进入的 shell 模式切换组件与窗格布局。
- [Web 客户端 slot](../../../docs/subsystems/slots.zh.md)——`shell.mode.pane` keyed slot 与 slot 货币。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包是宿主路由之上的浏览器外壳；此处没有任何内容到达模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

这些限制告诉你本界面尚未做到什么；它们是本包当前的约束，而非任务清单。

- **预览是播放器或分镜列表，而非时间轴。** 中间播放最新渲染或按脚本顺序列出分镜；带共享播放头与 seek 的字幕、画面缩略图与音频轨道属延后工作。
- **列表靠轮询，而非推送。** agent 写入项目目录的变化在下一次五秒轮询时出现，而非即时，且只在视频窗格挂载期间。
- **模式需要 layout 服务。** 切换组件与窗格针对 `ctx.layout` 与 `shell.mode.pane` slot 注册；不含 layout 服务的组合不绘制视频模式。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

不发布不变量伴生包，因为本包是浏览器侧的 slot 占用者，其 roster 控制器持有项目状态的唯一副本，因此不存在会发生分歧的独立观测。

</details>
