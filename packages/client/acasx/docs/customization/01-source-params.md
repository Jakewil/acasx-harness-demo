---
description: 'ACAS.X 定制第一类：用可选属性和注入参数扩展上游接口，接住产品新需求而不改变默认行为。'
kind: 'customization-note'
---

# 定制一：用可选属性扩展上游源码参数

本分支对应 `codex/acasx-1-params`，处理三类新需求：内部 preset 不出现在选择器、产品会话固定工作区、产品外壳不显示通用「新建会话」按钮。它们都不改变上游既有语义，只是给上游多一个可选开关。

## 机制：可选字段 + 缺省即旧行为

三个需求都落在「新增可选属性，缺省时保持上游原行为」这一条上，避免用条件分支改变已有默认值。

| 需求 | 扩展点 | 缺省值 | 语义 |
| --- | --- | --- | --- |
| 内部 preset 不进选择器 | `PresetDefinition.hidden?` → `AgentPresetRow.hidden?` → `AgentPresetOption.hidden?` | `undefined`（可见） | 名字仍可解析用于会话芯片/头部，只有用户选择器与设置 roster 过滤 |
| 产品会话固定工作区 | `ConversationInjected.workspaceSwitchEnabled?` | `undefined`（可切换） | `false` 时已选中工作区的 hero chip 置灰锁定；冷启动未选中时仍保留首次选择入口 |
| 外壳不显示「新建会话」 | `SidebarRootInjected.showNewSession?` | `undefined`（渲染） | 产品把新建入口收进具体场景；`false` 时品牌字标与胶囊按钮都降级为纯展示 |

关键取舍是「缺省值等于旧行为」：`hidden` 缺省可见、`workspaceSwitchEnabled` 缺省可切换、`showNewSession` 缺省渲染。上游组合不传这些字段时，行为与改动前逐字一致，因此这类改动不需要迁移和升级说明。

## 候选方案与取舍

这三个需求的共同点是「产品要多一个行为，但上游默认行为不能变」。可选路径有四类，逐一对比后落在新增可选字段上：

| 候选方案 | 做法 | 不采用的原因 |
| --- | --- | --- |
| 直接改消费组件 | 在 `ui-agent-preset`、`ui-conversation`、`ui-sidebar` 里写死产品逻辑 | 产品策略混进通用组件，其他组合一起受影响；上游每次重构这些组件都要重新回归 |
| 产品组件整体替换 | 阴影覆盖 `sidebar`、`conversation.content` 等大槽位 | 要重实现菜单、加载态、工作区选择、组合器接线等既有能力，代码量与升级面都远大于加一个字段 |
| CSS / DOM 隐藏 | 隐藏 preset 项、禁用 chip、隐藏按钮 | 只改表现不改语义；隐藏只读控件仍留可聚焦元素，上游 DOM 一改就失效 |
| 运行时打补丁或全局常量 | monkey-patch 组件，或写死一个产品开关 | 仓库禁止把部署差异硬编码进插件；隐式覆盖让读者无法从类型和配置看出行为来源 |
| 插件 Config 字段 | 由 `cordis.yml` 配置产品开关 | 现在客户端插件拿不到配置：boot manifest 只按 `id` 创建 entry（见 `packages/client/modules/src/client/entries.ts`），要做成 Config 得先给客户端插件补配置通道，成本大于本需求 |

选「可选属性 + 缺省等于旧行为」的理由：

- 需求本身是「多一个可选行为」而不是「换一套行为」，可选字段是表达能力最小的手段。
- `undefined` 保留旧行为，未传字段的组合与改动前逐字一致，不需要迁移或升级说明。
- 行为来源留在类型和调用点，`strict` 下消费者漏处理会编译失败，而不是运行期静默。
- 三个字段都不触碰持久化格式与 wire 协议，升级时冲突集中在字段定义处。

这个方案不是没有成本：产品策略以数据形式穿过上游类型，字段变多后要在 owning 类型里维护缺省语义；隐藏入口只改渲染角色，`startSession` 回调仍存在，产品需要在场景内自行调用。这个成本随字段数线性增长，而替换组件的成本随上游重构次数增长。

## 改动文件（上游侵入清单）

| 文件 | 改动 |
| --- | --- |
| `packages/preset/agent-preset-registry/src/{definition,preset,types,index}.ts` | `hidden?: boolean` 可选字段与透传 |
| `packages/preset/agent-preset/src/index.ts` | Config schema 增加 `hidden: z.boolean()` |
| `packages/preset/agent-preset/README.md`、`README.zh.md`、`README.i18n.yaml` | 字段文档与配对哈希 |
| `packages/client/ui-agent-preset/src/client/{settings-store,section-store,AgentPresetSeat}.tsx` | 透传 `hidden`；菜单与设置 roster 过滤它 |
| `packages/client/ui-conversation/src/client/contract/slots.ts` | `ConversationInjected.workspaceSwitchEnabled?` |
| `packages/client/ui-conversation/src/client/{apply.ts,skeleton/ConversationContent.tsx,skeleton/EmptyHero.tsx,skeleton/HeroShell.module.css}` | 注入 `false`，chip 的置灰锁定态 |
| `packages/client/ui-sidebar/src/client/{contract/slots.ts,index.ts,SidebarRoot.tsx}` | `showNewSession?: boolean` 与条件渲染 |
| `apps/web/tests/expected/agent-preset-selection/hero.expected.md` | 锁定时按预期更新 |
| `docs/config-catalog.md`、`docs/config-catalog.zh.md` | `preset.ts` 行号随字段下移 |

## 复刻步骤

1. 在 owning 类型上加可选字段并写清缺省语义，例如 `hidden?: boolean` 注释「缺省可见」。
2. 沿数据链透传：声明类型 → registry row → list → 客户端 store，读到 `undefined` 时不补值。
3. 在消费点做「显式默认」判断：`option.hidden !== true`、`workspaceSwitchEnabled === false`、`showNewSession === undefined || showNewSession`，不要在上游默认值上做隐式覆盖。
4. 为可选字段补测试：新增开启用例，并保留缺省用例断言旧行为。
5. 若字段进入生成文档，重跑 `pnpm run doc-sync` 中对应的 catalog 生成，保持 `docs/config-catalog*.md` 与源码一致。

## 验证与边界

- 单测覆盖三个包的本地行为：`pnpm --filter @deepseek-ai/dsh-agent-preset-registry test`、`pnpm --filter @deepseek-ai/dsh-client-ui-agent-preset test`、`pnpm --filter @deepseek-ai/dsh-client-ui-conversation test`、`pnpm --filter @deepseek-ai/dsh-client-ui-sidebar test`。
- 快照 `apps/web/tests/expected/agent-preset-selection/hero.expected.md` 记录锁定态，是端到端行为信号。
- 隐藏入口只改渲染角色，`startSession` 回调与快捷键绑定不变，产品在场景内部仍可复用同一动作。
- 三个字段都不进入 Session 持久化格式、不进入 wire 协议、不改变默认渲染，因此升级风险集中在上游同名类型的定义处；上游破坏这些类型时，编译错误会先暴露。
