---
description: "视频制作组合包：叠在 dsh-web-app 之上的 patch 层，挂载视频项目宿主路由与 shell 模式，并将新建会话默认设为 video preset，供组合或定制 profile 的用户使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-video-app

[English](README.md) | 中文

## 概述

本组合包把一个 web profile 变成视频制作界面。它是叠在 `dsh-web-app` 之上的 patch 层，挂载视频项目宿主路由与视频 shell 模式，并将新建会话默认设为 `video` agent preset。已发布的 `video` profile 已包含它，排在 `dsh-base` 与 `dsh-web-app` 之后；你通过在自己 profile 的 bundle 列表中命名它来加入，也以同样方式移除。它是一个 patch 列表载体，而非可导入的库或可挂载的单个插件。

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

### 安装进 profile

已发布的 `video` profile 已命名本组合包：其模板按顺序列出 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 与 `@deepseek-ai/dsh-video-app`，因此 `dsh --profile video "your task"` 无需额外步骤即激活该层。内置组合包从 dsh 安装目录解析，而非注册表，因此自定义 profile 通过在其 `package.json` 的 `dsh.profile.bundles` 列表中、排在它所 patch 的层之后命名它来加入：

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-video-app"]
    }
  }
}
```

`dsh plugin --profile <name> add @deepseek-ai/dsh-video-app` 是树外（out-of-tree）路径：它转发给 `pnpm add`，后者针对 npm 注册表解析。由于本包随 dsh 安装目录一同发布、并未发布到注册表，该命令在源码检出中会以注册表 404 失败——请改为在 profile 的 bundle 列表中命名它。reconcile 步骤只在某个依赖解析到声明 `dsh.bundle.patch` 的包时才激活它；本包声明了该字段，因此命名它的 profile 会把其 patch 叠在更早的 bundle 之上，而不含该声明的包只作为普通依赖安装、不激活任何层。

### 你得到什么

该层增加两条配置项与一处覆盖。[`dsh-host-video-project`](../../host/video-project/README.zh.md) 提供受认证的 `/api/video` 路由；[`dsh-client-ui-video`](../../client/ui-video/README.zh.md) 绘制顶栏模式切换组件与列表、预览窗格；`agent-presets` 配置项将新建会话默认设为 `video` preset。每条配置项的行为由其各自的包拥有。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

本组合包是一份静态 patch 文档：一个 `insert` 列表加一处按 id 定位的覆盖，在 `dsh-base` 与 `dsh-web-app` 之后叠于空 profile 根之上。它不挂载服务、不发事件、不持有可变状态；每条插入配置项的行为与不变量由其各自的包拥有。

patch 替换目标配置项的整个 `config` 而非并入，因此 `agent-presets` 配置项重述了它拥有的唯一一个键（`default: video`）。该覆盖之所以生效，是因为加载器会为先前 `insert` 添加的配置项建立索引，故后一层即使面对由 `dsh-web-app` 插入的 `agent-presets`，也能按 id 定位它。默认值只填充未设定的选择：已固定到某 preset 的会话保持原样，而用户通过设置界面存储的默认值仍优先于本配置项。profile 自身的 `cordis.patch.yml` 与任何 `--patch` 叠加层在本层之后应用。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 组合包实质：两条插入配置项与 preset 默认值覆盖，附逐项理由 |
| [`src/index.ts`](src/index.ts) | 包入口；不携带运行时 API |
| [`tests/video-app.spec.ts`](tests/video-app.spec.ts) | manifest 声明、插入配置项与三层合成检查 |

### 不变量所有权

不发布不变量伴生包，因为本包是静态 patch 列表载体：每条插入配置项的不变量由其各自的包拥有，而本组合包没有可校验的可变关系。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [组合包地图](../README.zh.md)——可安装的 profile 层及其叠放方式。
- [app-boot profile 章节](../../boot/app-boot/README.zh.md)——profile 如何解析、分层与定制。
- [`dsh-host-video-project`](../../host/video-project/README.zh.md)——本层挂载的宿主路由。
- [`dsh-client-ui-video`](../../client/ui-video/README.zh.md)——本层挂载的浏览器界面。
- [生成组合图](../../../apps/cli/composition.md)——每个已发布 profile 使用的确切插件集。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过每条插入配置项各自的包，由它拥有该配置项面向模型的行为。

#### KV Cache 影响

组合包本身不增加请求前缀；任何缓存影响由每条插入配置项各自的包拥有。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

这些限制告诉你该层在何时需要留意、覆盖须落在何处；它们是本包当前的约束，而非任务清单。

- **覆盖替换整个设置块。** `agent-presets` 配置项替换该配置项的全部配置，因此需要其他 preset 设置的 profile 必须在其自身 patch 中重述它们；不会自动合并。
- **preset 默认值只填充未设定的选择。** 已固定到某 preset 的会话保持原样，而用户通过设置界面存储的默认值优先于本配置项。
- **内置，而非可从注册表安装。** `dsh plugin add` 针对 npm 注册表解析，对这个未发布的内置包会 404；请通过在 profile 的 bundle 列表中命名它来激活。
- **它 patch 在 web 层之上。** 本组合包假定 `dsh-web-app` 已在 profile 中；若不含该层就命名它，视频配置项会挂载进一个缺少它们所读取的 web connection 与 workspace 服务的组合。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
