---
description: "web GUI 的视频制作 shell 模式：一个顶栏切换组件，把项目列表、脚本与时间轴预览，以及处于纯聊天姿态的真实对话界面并列排布，供组合或调试浏览器视频界面的用户使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-video

[English](README.md) | 中文

## 概述

本包为 web GUI 增加一个视频制作模式。它的顶栏切换组件把默认三栏框架替换为：左侧项目列表、中间预览、右侧处于纯聊天姿态的已发布对话界面——即真实的转录与一个输入框，不含视图标签页或输入器工具行。中间在格式化的 `script.json` 与一个播放器之间切换，播放器带有刻度尺、三条对齐的轨道与一个可 seek 的播放头。输入器 dock 上的一张卡片提供产出该选中项目的会话。将它与提供数据的 [`dsh-host-video-project`](../../host/video-project/README.zh.md) 一同挂载。

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

切换组件在默认布局与 `video` 模式之间选择。在视频模式下，列表栏按最新在前列出发现的项目，每项含标题、分镜数、渲染徽章与更新时间；选中某项即驱动中间窗格，未选择时最新项目会自行打开。两个窗格共享一个 roster 控制器，每五秒轮询宿主一次，因此 agent 写入项目目录的分镜、旁白音频与渲染无需刷新即可出现。

中间窗格右上角的切换组件在两个界面之间切换。**脚本**把 `script.json` 排布为可供阅读的形式——标题、简介，以及每个分镜的视觉类型徽章、时长、描述、静态图与完整旁白——而非原始 JSON。**预览**播放该项目：已渲染的项目通过宿主支持 Range 的媒体路由以原生传输播放其最新的 `.mp4`，而未渲染的项目则在分镜片段上运行一个虚拟时钟，把当前分镜的静态图作为画面、旁白作为字幕，并依次播放每个分镜的旁白音频。播放器下方，一条刻度尺与三条对齐的轨道——字幕、画面缩略图与音频波形——共享同一水平几何，因此刻度尺右端的缩放控件会同时缩放三者，而在它们任意位置拖动都会 seek 播放头。

视图跟随项目的阶段：只有脚本的项目以**脚本**打开，渲染已出现的项目以**预览**打开；手动切换会在轮询中保留，直到项目进入新阶段。右栏是框架自身的对话界面，处于纯聊天姿态——气泡 Markdown、可折叠的中间步骤与一个输入框，不含视图标签页、模型席位或输入器工具行——因此在其中输入视频制作请求会运行该会话的 agent preset，并以与默认布局完全一致的方式渲染。

选中一个项目还会向宿主询问哪个会话产出了它。当有一个被指出时，该输入框上方出现一张卡片，携带其标题与一个把它变为对话主体的按钮；卡片绝不自行切换，在当前对话已经就是该会话时保持隐藏，并在你离开视频模式时消失。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

node 半侧是一个空 `apply`，用以把插件保留在宿主 roster 上；浏览器半侧通过 `exports["./client"]` 发布，由 `package.json` 中的 `dsh.client` 声明发现（inject `session-controller`、`locale`、`ui-conversation`、`ui-layout`、`ui-renderer`、`ui-session`；platform `web`）。

浏览器 `apply` 注册 `video` 语言词典、一个通过 `ctx.layout.registerShellMode` 注册的替代 shell 模式、`shell.mode.pane` keyed slot 上的两个窗格，以及 `conversation.input.dock` list slot 上的一张卡片。模式 spec 固定 `columns: '260px minmax(0, 1fr) 400px'` 与三个窗格——`projects`、`preview` 与 `{ kind: 'conversation', simple: true }`——因此框架在不知道视频项目为何物的情况下绘制切换组件并排布窗格；`simple` 标志把框架自身的 session-maybe 界面以纯聊天姿态重新挂载，而非其副本。label 是一个按渲染解析的 thunk，因此标签页跟随当前语言而无需重新注册。两个 slot 都用 `ctx.slots.inject` 填充，因为框架只在模式主体首次渲染时才声明窗格 slot，而对话只在 session 作用域上声明 dock。

一个 `VideoProjectsController`（[`src/client/video-store.ts`](src/client/video-store.ts)）拥有窗格与卡片共享的 roster、detail、视图模式、产出会话匹配与已解码波形缓存，因此左侧的选择即中间所渲染的内容，也是卡片所提供的内容。它通过同源 `fetch` 读取宿主的 `/api/video/*` 路由——连接层已为浏览器完成认证——并按间隔轮询，因为没有转发事件会通告 `script.json` 的变化；进行中的轮询不会被重复叠加。每次 detail 读取都会解析项目的阶段，且只在阶段变化时才重新驱动视图模式，因此轮询绝不会与手动切换冲突。匹配在仍未知时于每次轮询中再次询问，因为构建某项目的会话可能仍在写入宿主所搜索的日志；失败的探测、或为已不再被选中的项目作答的探测不发布任何内容，而 `start()` 的停止器会清除该匹配，因此卡片不会跟随你离开视频模式。波形峰值通过 Web Audio API 按每个音频路径解码一次并缓存于快照上；解码失败则缓存一个空集合，用以绘制占位条。

时间轴是关于分镜的纯数学（[`src/client/timeline.ts`](src/client/timeline.ts)）：`buildSegments` 按累计时长放置每个分镜，`rulerTicks` 选择一个在当前缩放下保持刻度清晰的步长，而共享的像素↔秒换算驱动刻度尺、三条轨道与播放头，因此它们不会彼此错位。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | node 半侧：空 `apply`，把插件保留在宿主 roster 上 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器半侧：语言、shell 模式、两个窗格注册与 dock 卡片 |
| [`src/client/video-store.ts`](src/client/video-store.ts) | roster 控制器、宿主传输、轮询、视图模式、会话匹配与波形缓存 |
| [`src/client/timeline.ts`](src/client/timeline.ts) | 纯片段、刻度尺与像素↔秒数学 |
| [`src/client/waveform.ts`](src/client/waveform.ts) | PCM 到峰值的归约与浏览器音频解码 |
| [`src/client/VideoProjectsPane.tsx`](src/client/VideoProjectsPane.tsx) | 左侧列表窗格 |
| [`src/client/VideoPreviewPane.tsx`](src/client/VideoPreviewPane.tsx) | 中间窗格：脚本/预览切换、播放状态与缩放 |
| [`src/client/VideoScriptView.tsx`](src/client/VideoScriptView.tsx) | 格式化的 `script.json` 界面 |
| [`src/client/VideoPlayer.tsx`](src/client/VideoPlayer.tsx) | 已渲染的 `<video>`，或当前分镜的静态图与字幕 |
| [`src/client/VideoTimeline.tsx`](src/client/VideoTimeline.tsx) | 刻度尺、三条轨道、播放头、传输与缩放控件 |
| [`src/client/VideoSessionBanner.tsx`](src/client/VideoSessionBanner.tsx) | 提供产出会话的输入器 dock 卡片 |
| [`src/client/locales.ts`](src/client/locales.ts) | 双语 `video` 命名空间词典 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-host-video-project`](../../host/video-project/README.zh.md)——本界面读取的宿主路由。
- [`dsh-video-app` 组合包](../../bundle/video-app/README.zh.md)——挂载两个半侧的 profile 层。
- [`dsh-client-ui-layout`](../ui-layout/README.zh.md)——本包注册进入的 shell 模式切换组件、`simple` 对话窗格与窗格布局。
- [`dsh-client-ui-conversation`](../ui-conversation/README.zh.md)——`simple` 标志以纯聊天渲染的对话界面。
- [Web 客户端 slot](../../../docs/subsystems/slots.zh.md)——`shell.mode.pane` 与 `conversation.input.dock` slot 及 slot 货币。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包是宿主路由之上的浏览器外壳；此处没有任何内容到达模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

这些限制告诉你本界面尚未做到什么；它们是本包当前的约束，而非任务清单。

- **未渲染的播放器是虚拟时钟，而非渲染。** 在项目的 `.mp4` 存在前，预览按分镜时长推进播放头并依次播放每个分镜的旁白音频；它不混合背景音乐、不渲染转场，且相对于最终视频并非帧级精确。已渲染的 `.mp4` 才是真正的预览。
- **波形需要 Web Audio。** 音频轨道通过 `AudioContext.decodeAudioData` 解码每个分镜的旁白；音频缺失、仍在写入或无法解码的分镜改为绘制占位条。
- **列表靠轮询，而非推送。** agent 写入项目目录的变化在下一次五秒轮询时出现，而非即时，且只在视频窗格挂载期间。
- **模式需要 layout 服务。** 切换组件与窗格针对 `ctx.layout` 与 `shell.mode.pane` slot 注册；不含 layout 服务的组合不绘制视频模式。
- **产出会话是被提供的，而非被强加的。** 卡片指出宿主通过搜索会话日志匹配到的会话，因此没有任何留存日志引用的项目不显示卡片，而一次点击是对话发生改变的唯一途径。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

不发布不变量伴生包，因为本包是浏览器侧的 slot 占用者，其 roster 控制器持有项目状态的唯一副本，因此不存在会发生分歧的独立观测。

</details>
