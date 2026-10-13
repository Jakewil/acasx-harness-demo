/** ACAS.X 业务界面：品牌字标、模块导航，以及各模块的主面板。 */
import 'virtual:acasx-uno.css'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/remote'
// 类型-only：把本包自己生成的 `acasxScenario` 命名空间合并进 Client Remote。
import type {} from '@deepseek-ai/dsh-client-acasx/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import acasxScenarioRemote from '@deepseek-ai/dsh-client-acasx/remote'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// 类型-only：引入 ui-conversation 的 hero 扩展槽声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ArchiveCompletenessPanel } from './archive/ArchiveCompletenessPanel.tsx'
import { AcasxBrandName } from './brand/BrandName.tsx'
import { AcasxCapabilitiesButton, type AcasxCapabilitiesInjected } from './hero/AcasxCapabilitiesButton.tsx'
import { parseMcpServers } from './hero/capabilities.ts'
import { AcasxHeroTitle } from './hero/AcasxHeroTitle.tsx'
import { ArchiveIcon, ChatIcon, ConnectorIcon, MoreIcon } from './panels/ModuleIcons.tsx'
import { ArchiveLibraryPage, MorePage, SkillConnectorPage } from './panels/PlaceholderPages.tsx'
import { RuleTrialIcon } from './rule-trial/RuleTrialIcon.tsx'
import { RuleTrialPage } from './rule-trial/RuleTrialPage.tsx'
import { AcasxAccountAction } from './sidebar/AccountAction.tsx'
import { AcasxSidebarTree, type AcasxSidebarInjected } from './sidebar/SidebarTree.tsx'
import { isMainConversationPanel, MAIN_CONVERSATION_PANEL, MainConversationController, shouldOpenMainConversation } from './main-conversation.ts'
import { en, NS, zh } from './locales.ts'

export type { AcasxSidebarInjected } from './sidebar/SidebarTree.tsx'

/** 根作用域依赖：槽位注册表、布局、右侧栏 tab、Remote 载体与全局 hook 提供者。 */
export const inject = ['slots', 'layout', 'sidebarRightTabs', 'remote', 'sessions', 'uiSession', 'uiWorkspace', 'locale']

/** 侧栏入口与它打开的主面板共用的 key。 */
const RULE_TRIAL_PANEL = brandString<MainPanelId>('acasx.rule-trial')

/** 其余业务模块的主面板 key。 */
const ARCHIVE_LIBRARY_PANEL = brandString<MainPanelId>('acasx.archive-library')
const SKILL_CONNECTOR_PANEL = brandString<MainPanelId>('acasx.skill-connector')
const MORE_PANEL = brandString<MainPanelId>('acasx.more')

/** 右栏「档案完整度」tab 的 id 与 kind。 */
const ARCHIVE_TAB = {
  id: '@deepseek-ai/dsh-client-acasx/archive',
  kind: 'acasx.archive',
} as const

/**
 * 挂载本包生成的 `acasxScenario` Remote 命名空间，再注册浏览器界面。
 *
 * 命名空间由本包自挂载而不是加进 `api-remotes` 外观：那会形成
 * `api/remotes → acasx → ui-workspace → api/remotes` 的工程引用环。
 * @param ctx - 客户端根上下文。
 * @returns 卸载时撤回 Remote 挂载的 disposer。
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(acasxScenarioRemote)
  // `acasxScenario` 由本插件自挂载，`remote.session` 由 api-remotes 挂载；两者都必须
  // 在声明了对应 inject 的子作用域里访问，否则 cordis 拒绝读取 `ctx.remote.<ns>`。
  const ui = ctx.inject(['remote.acasxScenario', 'remote.session', 'remote.skills', 'remote.agentPresets', 'workspaces'], registerAcasxUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}

/**
 * 写入 ACAS.X 品牌字标，并把「规则试算」模块注册成"一个侧栏入口 + 它打开的主面板"。
 * @param ctx - 客户端根上下文。
 */
function registerAcasxUi(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, AcasxBrandName))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'acasx: locale')

  ctx.slots.inject('conversation.hero.headline', () =>
    ctx.slots.register({ name: 'conversation.hero.headline', locale: NS }, AcasxHeroTitle),
  )
  ctx.slots.inject('conversation.hero.preview', () =>
    ctx.slots.register(
      {
        name: 'conversation.hero.preview',
        locale: NS,
        inject: (sessionId: SessionId | undefined): AcasxCapabilitiesInjected => ({
          load: async () => {
            if (sessionId === undefined) return { mcpServers: [], skills: [] }
            const skillsResult = await ctx.remote.skills.list({ sessionId })
            const skills = skillsResult.ok
              ? skillsResult.value.skills.map(skill => ({
                name: skill.name,
                description: skill.description,
                modelInvocable: skill.modelInvocable,
              }))
              : []
            const presetId = ctx.sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset
            const presetResult = typeof presetId === 'string' ? await ctx.remote.agentPresets.read(presetId) : undefined
            const mcpServers = presetResult?.ok ? parseMcpServers(presetResult.value.content) : []
            return { mcpServers, skills }
          },
        }),
      },
      AcasxCapabilitiesButton,
    ),
  )

  // 用更低的优先级阴影覆盖侧栏浏览区：`ui-workspace` 继续挂载并继续提供
  // `uiWorkspace` 服务（其他客户端插件都注入它），只是渲染位让给我们。
  const sidebarInjected = (): AcasxSidebarInjected => ({
    resolveScenarioWorkspace: async (target) => {
      const result = await ctx.remote.acasxScenario.workspacePath(target)
      if (!result.ok) throw result.error
      return result.value.path
    },
    createScenarioSession: async (cwd, agentPreset) => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const reusable = snapshot.ids.find((id) => {
        const summary = snapshot.byId[id]
        return summary !== undefined && summary.blank && summary.cwd === cwd
      })
      if (reusable !== undefined) return reusable
      // 先把场景目录注册成 Workspace（同路径幂等复用），会话再挂到它上面。只给 cwd
      // 会让会话没有归属 Workspace，hero 会停在“选择工作区”并禁用输入。
      const workspace = await ctx.workspaces.create({ path: cwd })
      const result = await ctx.remote.session.create({
        workspaceId: workspace.workspaceId,
        agentPreset,
      })
      if (!result.ok) throw result.error
      // 直接走 Remote 会绕过客户端 SessionManager 的本地记录，列表不会自动
      // 带上新会话；这里主动拉一次 Host 权威列表。
      await ctx.sessions.refresh()
      return result.value.sessionId
    },
    openScenarioSession: (sessionId) => {
      ctx.uiWorkspace.openSession(sessionId)
    },
  })
  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register({ name: 'sidebar.workspaces', priority: -1, inject: sidebarInjected }, AcasxSidebarTree),
  )
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: '@deepseek-ai/dsh-client-acasx/account', locale: NS, order: -10 },
      AcasxAccountAction,
    ),
  )

  const mainConversation = new MainConversationController(ctx)
  ctx.effect(() => {
    let firstReconcile = true
    const reconcile = (): void => {
      const activePanelId = ctx.layout.panelInfo.getSnapshot().activePanelId
      if (firstReconcile) {
        firstReconcile = false
        // 布局初始没有选中任何面板时，主面板回退渲染 `conversation`；这条路径也要
        // 交给主对话控制器，否则首次进入会停在默认会话而不是固定主对话。
        if (!shouldOpenMainConversation(activePanelId)) return
      } else if (!isMainConversationPanel(activePanelId)) {
        // 打开场景会话时 ui-workspace 会把 panel 切回 null；那不是主对话入口。
        return
      }
      void mainConversation.open().catch((reason: unknown) => {
        console.warn('打开主对话失败:', reason)
      })
    }
    const disposePanel = ctx.layout.panelInfo.subscribe(reconcile)
    reconcile()
    return disposePanel
  }, 'acasx: global main conversation')

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: RULE_TRIAL_PANEL }, RuleTrialPage)
    yield ctx.slots.register({ name: 'main', key: ARCHIVE_LIBRARY_PANEL }, ArchiveLibraryPage)
    yield ctx.slots.register({ name: 'main', key: SKILL_CONNECTOR_PANEL }, SkillConnectorPage)
    yield ctx.slots.register({ name: 'main', key: MORE_PANEL }, MorePage)
  })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: MAIN_CONVERSATION_PANEL.id,
        order: 1,
        label: MAIN_CONVERSATION_PANEL.label,
      },
      ChatIcon,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: RULE_TRIAL_PANEL,
        order: 2,
        label: '规则试算',
      },
      RuleTrialIcon,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: ARCHIVE_LIBRARY_PANEL,
        order: 3,
        label: '档案-资料库',
      },
      ArchiveIcon,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: SKILL_CONNECTOR_PANEL,
        order: 4,
        label: '技能-连接器',
      },
      ConnectorIcon,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: MORE_PANEL,
        order: 5,
        label: '更多',
      },
      MoreIcon,
    ),
  )

  // 右栏 tab 是"静态定义 + keyed 槽位主体"两条注册，共用同一个 id。
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: ARCHIVE_TAB.id,
        kind: ARCHIVE_TAB.kind,
        title: () => '档案',
        guide: [
          {
            id: ARCHIVE_TAB.kind,
            order: 10,
            title: () => '档案完整度',
            description: () => '查看该罪犯的档案填写情况',
          },
        ],
      }),
    'acasx: 档案 tab 类型',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ARCHIVE_TAB.id }, ArchiveCompletenessPanel),
      ),
    'acasx: 档案面板主体',
  )
}
