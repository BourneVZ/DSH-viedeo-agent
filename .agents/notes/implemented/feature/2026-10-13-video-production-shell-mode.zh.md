# Agent Note: 视频制作 shell 模式与 video-app 组合包

Status: implemented

[English](2026-10-13-video-production-shell-mode.md) | 中文

## 问题

video preset（`packages/preset/agent-presets/presets/video`）组成了一个视频制作 agent，但 web GUI 没有对应界面：用户通过普通对话驱动该 agent，无法查看 agent 写出的项目、预览分镜时间轴或播放渲染。GUI 框架是固定的三栏布局（sidebar、conversation、rightbar），没有替代整个 shell 布局的扩展点，因此在不分叉框架、也不在功能插件里重新搭建对话的前提下，无法加入视频界面。

## 决策

web GUI 获得一个替代 shell 模式的扩展点，视频界面则在其上以三个包加一个组合包与一个 profile 构建。

`dsh-client-ui-layout` 拥有该机制：功能插件通过 `ctx.layout.registerShellMode` 注册一个 `ShellModeSpec`，框架在默认布局旁绘制顶栏切换组件，并在某模式被选中时用该 spec 自身的窗格行替换三栏网格。框架不认识任何具体功能。spec 的窗格要么是 `{ kind: 'conversation' }`——在模式选定位置重新渲染框架自身的 `conversation` slot，并可选 `simple: true` 以采用纯聊天姿态，去掉视图标签页、模型席位、输入器工具行与头部角落席位，只保留转录与一个输入框——要么是 `{ kind: 'pane'; pane: <key> }`——分派进一个新的 root 作用域 keyed slot `shell.mode.pane`。复用 `conversation` slot 是关键选择：视频模式借此保留真实的会话头部、转录与输入器——气泡 Markdown、可折叠中间步骤，以及运行该会话 agent preset 的输入器——而非功能插件须自行维护的副本。

`dsh-host-video-project` 是数据面：它在已注册工作区下发现每个含 `script.json` 的目录，并提供 `/api/video` 下三条受认证路由（项目列表、单个项目已解析的分镜时间轴、支持 Range 的媒体字节）。它不注册 Cordis 服务，也不注册面向模型的工具；浏览器半侧是其唯一消费者。

`dsh-client-ui-video` 是浏览器半侧：它注册 `video` shell 模式、`shell.mode.pane` 上的 `projects` 与 `preview` 窗格，以及 `video` 语言命名空间。一个 roster 控制器每五秒轮询宿主一次，因为没有转发事件会通告 `script.json` 的变化。中间窗格在格式化的 `script.json` 与一个播放器之间切换，播放器带有刻度尺与三条对齐的轨道——字幕、画面缩略图与已解码的音频波形——以及一个共享的可 seek 播放头与缩放控件；已渲染的项目播放其最新的 `.mp4`，未渲染的项目则在分镜片段上运行一个虚拟时钟。视图跟随项目的阶段，因此只有脚本的项目以脚本打开，渲染已出现的项目以播放器打开。

`dsh-video-app` 是组合包：一个叠在 `dsh-web-app` 之上的 `dsh.bundle.patch` 层，插入两条视频配置项并把 `agent-presets` 配置项的 `default` 覆盖为 `video`。已发布的 `video` profile 模板按顺序命名 `dsh-base`、`dsh-web-app` 与 `dsh-video-app`，因此 `dsh --profile video` 无需额外步骤即激活该界面。

### 包拓扑

| 包 | 组 | 职责 |
|---|---|---|
| `@deepseek-ai/dsh-host-video-project` | `host/` | `/api/video` 发现、时间轴与媒体路由 |
| `@deepseek-ai/dsh-client-ui-video` | `client/` | 视频 shell 模式、列表与预览窗格 |
| `@deepseek-ai/dsh-video-app` | `bundle/` | 挂载两者并默认 preset 的 patch 层 |

shell 模式机制本身位于既有的 `@deepseek-ai/dsh-client-ui-layout`；未创建新的布局包。

## 考虑过的替代方案

**把框架分叉成视频专用 shell。** 一个独立的顶层组件可硬编码三窗格视频布局。它落选是因为会重复框架已拥有的 sidebar、conversation 与 rightbar 挂载，且此后每次框架改动都须在两个 shell 中镜像。扩展点保留单一框架，并让任何功能都能贡献一个模式。

**在视频插件里重新搭建对话。** 视频插件可挂载自己的转录与输入器，而非复用框架的 `conversation` slot。它落选是因为对话界面庞大且绑定会话；副本会与真实界面漂移，并重新实现气泡 Markdown、可折叠步骤、审批与输入器。`{ kind: 'conversation' }` 窗格原样复用已发布界面。

**用转发事件而非轮询推送项目变化。** 宿主可在 `script.json` 变化时发事件。它落选是因为 agent 通过 filesystem seam 写入项目目录，而视频路由并不观察它；接入 watcher 会为 UI 本就能容忍的五秒陈旧读取新增一个事件面。轮询是更小的机制，并被记录为一项限制。

**把视频配置项放进 `dsh-web-app` 而非新组合包。** web 层可直接携带视频配置项。它落选是因为视频界面是可选且 preset 专属的；独立的 `dsh-video-app` 层让 `web` 不含它，并使 `video` profile 成为唯一挂载它的界面，与 `headless`、`acp-app` 叠在 `base` 之上的方式一致。

## 影响

框架获得了一个任何功能都可使用的通用扩展点，代价是 `ui-layout` 中多一个 root 作用域 keyed slot（`shell.mode.pane`）与一个模式切换 store。视频界面是三个必须保持同步的包：宿主路由约定、浏览器传输，以及挂载它们的组合包 patch。该组合包只能通过在 profile 的 bundle 列表中命名它来激活——`dsh plugin add` 针对 npm 注册表解析，对这个未发布的内置包会 404——因此 `video` profile 模板是受支持的激活路径。preset 默认值只填充未设定的选择：已固定到某 preset 的会话保持原样，用户存储的默认值仍优先。中间预览是一个脚本与时间轴播放器，而非分镜列表：在渲染存在前，播放器是分镜片段上的虚拟时钟，相对于最终视频并非帧级精确，且音频轨道的波形需要 Web Audio API，当某分镜旁白缺失或无法解码时回退为占位条。对话窗格的 `simple` 纯聊天姿态是视频模式所消费的 `ui-layout`/`ui-conversation` 能力，因此另一个模式无需第二套机制即可复用它。
