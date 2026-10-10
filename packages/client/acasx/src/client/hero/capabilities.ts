/** ACAS.X 能力弹窗的数据视图与 preset 组合解析。 */

import { parse } from 'yaml'

/** 一个已配置的 MCP 服务器。 */
export interface AcasxMcpServerView {
  /** `mcp-client` 的 serverName。 */
  readonly name: string
}

/** 一个对当前会话可见的 skill。 */
export interface AcasxSkillView {
  readonly name: string
  readonly description: string
  readonly modelInvocable: boolean
}

/** 弹窗一次读取到的能力视图。 */
export interface AcasxCapabilitiesView {
  readonly mcpServers: readonly AcasxMcpServerView[]
  readonly skills: readonly AcasxSkillView[]
}

interface RawPresetRow {
  readonly name?: unknown
  readonly group?: unknown
  readonly config?: unknown
}

/**
 * 从 preset 的组合 YAML 中递归收集 `mcp-client` 行的 serverName。
 * @param content - `agentPresets/read` 返回的 entry-list YAML。
 * @returns 去重后的 MCP 服务器列表。
 */
export function parseMcpServers(content: string): AcasxMcpServerView[] {
  let parsed: unknown
  try {
    parsed = parse(content)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const names = new Set<string>()
  const visit = (rows: readonly unknown[]): void => {
    for (const value of rows) {
      if (typeof value !== 'object' || value === null) continue
      const row = value as RawPresetRow
      if (row.group === true && Array.isArray(row.config)) {
        visit(row.config)
        continue
      }
      if (typeof row.name !== 'string' || !row.name.startsWith('@deepseek-ai/dsh-mcp-client')) continue
      if (typeof row.config !== 'object' || row.config === null) continue
      const serverName = (row.config as { serverName?: unknown }).serverName
      if (typeof serverName === 'string' && serverName !== '') names.add(serverName)
    }
  }
  visit(parsed)
  return [...names].sort().map(name => ({ name }))
}
