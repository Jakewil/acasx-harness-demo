/**
 * ACAS.X Host 半边：把（罪犯, 场景）解析成场景工作目录，供浏览器侧新建会话时
 * 作为 `cwd`。浏览器半边通过 `exports["./client"]` 发布。
 */
import { mkdir } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { MainConversationPath, ScenarioWorkspacePath, ScenarioWorkspaceRequest } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** ACAS.X 场景工作目录服务。 */
    acasxScenario: AcasxScenario
  }
}

/**
 * 场景工作目录服务：会话的 `cwd` 由 Host 统一决定，浏览器不自己拼路径。
 */
export default class AcasxScenario extends TypertRemoteService {
  /**
   * @param ctx - Host 根上下文。
   */
  constructor(ctx: Context) {
    super(ctx, 'acasxScenario')
  }

  /**
   * 把（罪犯 id, 姓名, 场景）解析成 `$DSH_HOME/workspaces/<id>-<姓名>/<场景>`，
   * 并按需创建该目录：客户端要先把路径注册成 Workspace，而 Workspace 注册要求
   * 目录已存在。
   * @param request - 罪犯 id、姓名与场景名。
   * @returns 场景工作目录的绝对路径。
   */
  @Remote
  async workspacePath(request: ScenarioWorkspaceRequest): Promise<ScenarioWorkspacePath> {
    const path = dshHomePath('workspaces', `${request.criminalId}-${request.criminalName}`, request.scenario)
    await mkdir(path, { recursive: true })
    return { path }
  }

  /**
   * 解析全局唯一主对话的工作目录 `$DSH_HOME/main-conversation`，并按需创建。
   * @returns 主对话工作目录的绝对路径。
   */
  @Remote
  async mainConversationPath(): Promise<MainConversationPath> {
    const path = dshHomePath('main-conversation')
    await mkdir(path, { recursive: true })
    return { path }
  }
}
