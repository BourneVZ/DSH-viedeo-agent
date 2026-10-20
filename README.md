# AI 视频制作 Agent

[English](README.en.md) | 中文

这个仓库把一次对话变成一条成片。你给出一个主题，Agent 会写出逐分镜脚本、合成旁白、生成或动画化画面、组装 HyperFrames 合成工程并渲染出 MP4；与此同时，浏览器工作台会随产物出现依次展示脚本、分镜时间轴与成片。

它构建于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）之上——这是 [DeepSeek AI](https://deepseek.com) 开源的 agent harness（智能体框架），其**一切皆插件**的架构由 [Cordis](https://github.com/cordiverse/cordis) 驱动，设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。视频能力是叠加在该 harness 上的又一个 profile，而不是重写它：每个部件都是插件；为了让工作台与 profile 接入而改动的少数基底文件，在 [NOTICE](NOTICE) 里逐条列出。

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代，因此**会出现破坏兼容性的变更**。运行前请阅读[安全说明](SAFETY.zh.md)。

## 它能做什么

下面这些能力都在一条命令启动后的同一个浏览器标签页里运行。

| 能力 | 你会得到什么 |
| --- | --- |
| 三阶段制作 | Agent 依次写脚本、做视频、渲染导出，每个阶段之间停下来等你确认 |
| 分镜时间轴工作台 | 一把刻度尺，字幕、画面缩略图与音频波形三条轨道共用一个可拖动的播放头 |
| 脚本与播放器双视图 | 既能读格式化后的 `script.json`，也能播放最新的 MP4；尚未渲染的工程按分镜跑一个虚拟时钟 |
| 产出会话回溯 | 选中一个项目，即可看到从会话日志里匹配出的、产出它的那次对话 |
| 媒体工具进入循环 | `generate_speech`、`generate_image`、`video_lint`、`video_snapshot`、`video_render` 都是普通的 Agent 工具 |

## 视频是怎么做出来的

Agent 遵循 [video preset](packages/preset/agent-presets/presets/video/agent.cordis.yml) 里声明的固定三阶段契约。每个阶段结束时都会汇报成果并等待你确认。

1. **写脚本** — 把主题拆成分镜，为每个分镜写好旁白，并把完整方案写进工程目录下的 `script.json`。
2. **做视频** — 合成每个分镜的旁白、测得音频时长、据此确定该分镜的画面时长，再用 HTML 动画或生成图片把画面做出来。
3. **渲染导出** — 仅在你明确要求时进行：先用 `video_lint` 校验工程，再用 `video_snapshot` 抓关键帧做视觉核对，最后用 `video_render` 输出 MP4。

工作台并排保留三个窗格；细节由 [ui-video README](packages/client/ui-video/README.zh.md) 承担。

- **左侧** — 项目清单，每五秒在所有已注册工作区上重新扫描一次。
- **中间** — 脚本视图与时间轴播放器，跟随项目所处阶段自动切换。
- **右侧** — 纯聊天姿态的会话：只有转录与一个输入框，不含视图标签页与输入器工具行。

<a id="run"></a>

## 快速开始

### 环境要求

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`，即仓库声明的 `packageManager`
- HyperFrames CLI 可在 `PATH` 上找到，快照拼图还需要 ImageMagick
- 一个用于驱动模型的 DeepSeek API key

### 配置凭据

在仓库根目录写一个 `.env`。项目级文件优先于用户级文件，任何 key 都不入库。

```sh
DEEPSEEK_API_KEY=sk-your-key
EVOLINK_API_KEY=your-evolink-key
DASHSCOPE_API_KEY=your-dashscope-key
```

只与 Agent 对话的话仅需 `DEEPSEEK_API_KEY`。另外两个在模型调用 `generate_image` 与 `generate_speech` 时读取；模型配置见[提供商指南](docs/user/guide/providers.zh.md)。

<a id="run-from-source"></a>

### 启动

在仓库根目录执行：

```sh
pnpm install
pnpm run build
pnpm dsh --profile video
```

该命令会打印一个带一次性 token 的 URL 并用默认浏览器打开它；不带这个 token 直接访问地址会得到 `401`。默认监听 `http://127.0.0.1:3080`——用 `--port <port>` 换端口，用 `--no-open` 只起服务不开浏览器。

### 第一个视频

1. 把要存放视频工程的目录注册为工作区。
2. 新建一次会话；`video` profile 已把它的默认 Agent preset 设为视频制作 Agent。
3. 提出你的视频需求，并在 Agent 到达每个阶段时予以确认。
4. 在左侧项目清单里选中该工程，跟踪它的脚本、时间轴与成片。

视频工作台只有项目、预览与会话三个窗格，不含侧栏，工作区列表在 `web` profile 里管理。两个 profile 共用 `$DSH_HOME/storages/workspace.json`，所以工作区只需注册一次。

## 运行模式

一个 profile 就是一叠有序的 bundle patch 层。`video` 是本仓库新增的那一层，另外三个随 harness 一起发布。

| Profile | 层 | 适用场景 |
| --- | --- | --- |
| `video` | `dsh-base` + `dsh-web-app` + `dsh-video-app` | 视频工作台与视频制作 Agent |
| `web` | `dsh-base` + `dsh-web-app` | 常规浏览器聊天界面 |
| `headless` | `dsh-base` + `dsh-headless` | 在终端里答完一个任务就退出 |
| `acp` | `dsh-base` + `dsh-acp-app` | 通过 Agent Client Protocol 做自动化 |

## 外部依赖

媒体工具会调用 harness 不随包提供的外部服务与可执行文件。

| 依赖 | 被谁使用 | 缺它会怎样 |
| --- | --- | --- |
| HyperFrames CLI | `video_lint`、`video_snapshot`、`video_render` | 三个渲染类工具失败；写脚本与做视频仍可用 |
| ImageMagick | `video_snapshot` 的快照拼图 | 快照只返回单帧，不再拼图 |
| EvoLink API key | `generate_image` | 调用时该工具报出缺失的 key |
| DashScope API key | `generate_speech` | 调用时该工具报出缺失的 key |

## 仓库结构

完整的包分组由 [packages/README.zh.md](packages/README.zh.md) 承担。改动视频能力时会碰到的是下面四处。

- `packages/preset/agent-presets/presets/video/` — Agent 的人设与工具组合，三阶段契约就在这里
- `packages/host/video-project/` — `/api/video` 的四条路由：项目列表、分镜时间轴、媒体字节、产出会话
- `packages/client/ui-video/` — 工作台：shell 模式、项目清单、脚本与时间轴播放器、会话提示条
- `packages/web/tool-hyperframes/`、`tool-image-gen/`、`tool-tts/` — 三个媒体工具包

## 开发

先读[开发指南](docs/development.zh.md)，在改动 `packages/` 下任何内容之前再读[架构文档](docs/architecture.zh.md)。

- [AGENTS.md](AGENTS.md) — 每位贡献者与 Agent 都要遵守的常备规则
- [docs/glossary.zh.md](docs/glossary.zh.md) — 代码库里精确使用的术语表
- [docs/testing.zh.md](docs/testing.zh.md) — 每类改动各自必须证明什么
- [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md) — 提交改动的约定，含上游当前是否接收外部 PR

## 安全

Agent 会在你的机器上执行 shell 命令、写文件，并调用付费的外部 API。[SAFETY.zh.md](SAFETY.zh.md) 说明它能触达什么、审批栈又如何限制它；首次运行前请先读它。

用这条流水线产出视频之前，还需要知道四件事：

- **费用**：`generate_image` 与 `generate_speech` 用你自己的 key 调用 EvoLink 与阿里云 DashScope 两项第三方服务，由此产生的费用由该服务按其条款与你结算，本仓库不经手账单。
- **数据流向**：分镜旁白文本与图片提示词会作为请求内容发送到 `https://api.evolink.ai` 和 `https://dashscope.aliyuncs.com`；不要把不宜外发的素材写进工程。
- **生成内容标识**：`video_render` 输出的 MP4 不带「AI 生成」显式标识，也不写入隐式标识元数据。中国大陆境内面向公众提供生成合成内容时，《人工智能生成合成内容标识办法》与配套的强制性国家标准要求服务提供者添加两类标识；发布前请按你的适用法域自行补齐，并把标识留在成片里。
- **素材权利**：旁白文本、字体、图片与背景音乐的版权，以及肖像和声音的使用授权，由工程的使用者负责。Agent 生成的画面不自动取得任何第三方素材的许可。

## 许可证

本仓库的许可是分层的：

- 基底 DeepSeek Harness（`packages/` 下除视频层以外的包、`apps/`、`docs/`、`scripts/` 等）依 [MIT](LICENSE) 授权，版权归 DeepSeek 所有。
- `vendor/` 内的 Cordis 框架源码逐目录保留其上游 MIT 许可文件；`native/system/` 依 [BSD-3-Clause](native/system/LICENSE) 授权。
- 视频制作层——`video-project`、`ui-video`、`video-app`、视频 preset 与三个媒体工具包——是本仓库的原创改动，同样以 MIT 条款提供。
- 依赖名称与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，完整闭包与精确版本见 [pnpm-lock.yaml](pnpm-lock.yaml)。

来源、改动清单、商标与非背书声明，以及发行物上尚未闭合的许可缺口，记录在 [NOTICE](NOTICE)。
