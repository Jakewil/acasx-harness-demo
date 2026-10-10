---
description: 'ACAS.X 定制第二类：在上游 UI 组合里新增可被产品占用的单槽位，用 fallback 保持默认渲染。'
kind: 'customization-note'
---

# 定制二：为上游 UI 增加自定义插槽

本分支对应 `codex/acasx-2-slots`。上游 hero 的标题与「预览版」徽标是写死的字符串，产品需要按会话场景改标题、把徽标换成能力入口，又不能影响不挂产品的组合。

## 机制：新增 `single` 槽位 + fallback 渲染

在上游 `ui-conversation` 的 `conversation.content` factory 里新增两个 `single` 槽位，作用域为 `session-maybe`，再用 `renderSlot(name, owner, { fallback })` 渲染：槽位被占用时渲染占用方，未占用时渲染原来的元素。

| 槽位 | 作用域 | fallback |
| --- | --- | --- |
| `conversation.hero.headline` | `session-maybe` | 原来的 `<span>{t('hero.headline')}</span>` |
| `conversation.hero.preview` | `session-maybe` | 原来的 `<span className={css.previewBadge}>{t('hero.preview')}</span>` |

`session-maybe` 与 hero 的语义一致：没有选中会话时也渲染，只是占用方读不到会话 id。这样产品既能在有会话时按 preset 显示标题，也不会让空态 hero 缺一块。

## 为什么影响小

- 只新增槽位名，不改现有槽位的语义或注册顺序；未占用时 DOM 与改动前一致。
- 不改服务、不改类型之外的数据结构、不改持久化格式，占用方通过既有的 `ctx.slots.inject` 注册。
- 默认渲染留在上游，产品只提供替换内容；上游升级 hero 结构时，冲突集中在 `renderSlot` 调用点。

## 改动文件（上游侵入清单）

| 文件 | 改动 |
| --- | --- |
| `packages/client/ui-conversation/src/client/contract/slots.ts` | 模块合并里声明两个槽位；factory 的 `children` 映射同步声明 |
| `packages/client/ui-conversation/src/client/apply.ts` | 运行时 `children` 注册两个槽位定义 |
| `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx` | 标题与徽标改为 `renderSlot(..., { fallback })` |
| `packages/client/ui-conversation/tests/skeleton.client.spec.tsx` | 断言占用与 fallback 两条路径 |
| `packages/client/ui-conversation/README.md`、`README.zh.md` | 记录新槽位契约 |

## 复刻步骤

1. 在 owning 包（这里是 `ui-conversation`）的类型声明与运行时 `children` 映射里同时登记槽位，名称、`kind`、`scope` 三处一致。
2. 把原本写死的节点改成 `renderSlot("<name>", <owner>, { fallback: <原节点> })`，保留原节点作为 fallback。
3. 在占用方包里 `ctx.slots.inject("<name>", () => ctx.slots.register({ name: "<name>" }, Component))`，注册即 effect，卸载自动撤销。
4. 给槽位补测试：`renderSlot` 被以期望的名称调用，且返回 fallback 时页面内容与改动前一致。
5. 用真实组合做一次 smoke，确认未挂占用方时默认文案/徽标仍在。

## 与其它槽位手法的关系

本分支只演示「新增槽位声明」。`sidebar.workspaces` 的 `priority: -1` 阴影覆盖、keyed `main` + list `sidebar.panellist`、`sidebarRightTabs` + keyed `sidebar.right.pane.tab` 都是使用上游已有槽位，占用方注册集中在 `packages/client/acasx`，见第三类定制说明。
