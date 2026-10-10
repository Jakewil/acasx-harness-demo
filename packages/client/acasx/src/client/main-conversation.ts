/** 全局唯一主对话的入口类型、会话类型与单例生命周期。 */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-client-acasx/remote'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** 主对话固定在标准 preset；空值表示部署尚未记录 preset。 */
function isMainConversationPreset(summary: Pick<SessionSummary, 'projectionValues'>): boolean {
  const preset = summary.projectionValues?.agentPreset
  return preset === undefined || preset === null || preset === 'standard'
}

/** 顶部「主对话」入口；它与罪犯场景共用侧栏面板外壳，但语义独立。 */
export interface MainConversationPanel {
  readonly kind: 'main-conversation'
  readonly id: MainPanelId
  readonly label: string
}

/** 全局唯一主对话对应的会话身份。 */
export interface MainConversationSession {
  readonly kind: 'main-conversation'
  readonly sessionId: SessionId
}

/** 主对话面板的稳定身份；布局中的保留 key 仍为 `conversation`。 */
export const MAIN_CONVERSATION_PANEL: MainConversationPanel = {
  kind: 'main-conversation',
  id: brandString<MainPanelId>('conversation'),
  label: '主对话',
}

/**
 * 判断一个主面板是否为主对话入口。
 * @param id - 当前布局选中的主面板。
 * @returns 是主对话入口时为 true。
 */
export function isMainConversationPanel(id: MainPanelId | null): boolean {
  return id === MAIN_CONVERSATION_PANEL.id
}

/**
 * 管理全局主对话：固定专用工作目录，复用其中唯一会话；没有会话时创建一条
 * 空白会话，空状态直接进入正常发起对话。
 */
export class MainConversationController {
  private cwd: string | undefined
  private opening: Promise<MainConversationSession> | undefined

  /**
   * @param ctx - 已注入 Remote、Session、Workspace 与布局能力的客户端上下文。
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * 打开全局主对话；已有会话时直接复用，没有会话时创建空白会话。
   * @returns 打开完成后的 Promise。
   */
  async open(): Promise<void> {
    const main = await this.ensure()
    const current = Object.values(this.ctx.sessions.list.getSnapshot().byId).find(summary => (summary.retainedBy.mainView ?? 0) > 0)?.id
    if (current !== main.sessionId) this.ctx.uiWorkspace.openSession(main.sessionId)
    this.ctx.layout.selectPanel(MAIN_CONVERSATION_PANEL.id)
  }

  private ensure(): Promise<MainConversationSession> {
    if (this.opening !== undefined) return this.opening
    this.opening = this.createOrReuse().finally(() => {
      this.opening = undefined
    })
    return this.opening
  }

  private async createOrReuse(): Promise<MainConversationSession> {
    let cwd = this.cwd
    if (cwd === undefined) {
      const resolved = await this.ctx.remote.acasxScenario.mainConversationPath()
      if (!resolved.ok) throw resolved.error
      cwd = resolved.value.path
      this.cwd = cwd
    }
    if (this.ctx.sessions.list.getSnapshot().phase !== 'ready') await this.ctx.sessions.refresh()
    const existingWorkspace = this.ctx.workspaces.list.getSnapshot().items.find(item => item.path === cwd)
    const workspace = existingWorkspace ?? (await this.ctx.workspaces.create({ path: cwd }))
    if (workspace.title === 'main-conversation') {
      try {
        await this.ctx.workspaces.rename(workspace.workspaceId, MAIN_CONVERSATION_PANEL.label)
      } catch (reason: unknown) {
        console.warn('主对话工作区命名失败:', reason)
      }
    }
    const sessions = this.ctx.sessions.list.getSnapshot()
    const candidates = sessions.ids
      .flatMap((id) => {
        const summary = sessions.byId[id]
        return summary !== undefined && summary.cwd === cwd ? [summary] : []
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
    const reusable =
      candidates.find(summary => !summary.blank && isMainConversationPreset(summary))
      ?? candidates.find(summary => !summary.blank)
      ?? candidates.find(summary => isMainConversationPreset(summary))
      ?? candidates[0]
    if (reusable !== undefined) {
      return { kind: 'main-conversation', sessionId: reusable.id }
    }
    const created = await this.ctx.remote.session.create({
      workspaceId: workspace.workspaceId,
      agentPreset: 'standard',
    })
    if (!created.ok) throw created.error
    await this.ctx.sessions.refresh()
    return { kind: 'main-conversation', sessionId: created.value.sessionId }
  }
}
