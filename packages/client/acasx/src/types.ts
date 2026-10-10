/**
 * `acasxScenario` Remote 命名空间的线上类型。仅类型：生成的 Remote 客户端
 * 消费本模块，不加载 Host 运行时代码。
 * @module @deepseek-ai/dsh-client-acasx/types
 */

/** 解析一个（罪犯, 场景）组合对应的场景工作目录。 */
export interface ScenarioWorkspaceRequest {
  /** 业务罪犯 id。 */
  readonly criminalId: string
  /** 罪犯姓名；只参与目录名，不参与身份判定。 */
  readonly criminalName: string
  /** 场景名，例如「日常监管」「心盾」。 */
  readonly scenario: string
}

/** 一个场景工作目录在 Host 文件系统上的绝对路径。 */
export interface ScenarioWorkspacePath {
  /** `$DSH_HOME/workspaces/<id>-<姓名>/<场景>` 解析后的绝对路径。 */
  readonly path: string
}

/** 全局唯一主对话工作目录在 Host 文件系统上的绝对路径。 */
export interface MainConversationPath {
  /** `$DSH_HOME/main-conversation` 解析后的绝对路径。 */
  readonly path: string
}
