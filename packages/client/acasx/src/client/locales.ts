/** ACAS.X 产品界面文案。 */

/** 本包拥有的 locale 命名空间。 */
export const NS = 'acasx'

/** 简体中文字典，作为键集合的事实来源。 */
export const zh = {
  'hero.mainConversation': '主对话',
  'hero.dailySupervision': '日常监管',
  'hero.xindun': '心盾',
  'hero.preview': '相关工具',
  'capabilities.title': '当前对话能力',
  'capabilities.mcp': 'MCP',
  'capabilities.skills': 'Skills',
  'capabilities.loading': '加载中…',
  'capabilities.error': '能力信息加载失败',
  'capabilities.mcp.empty': '当前对话未使用 MCP',
  'capabilities.skills.empty': '当前对话未加载 Skill',
  'capabilities.skill.modelInvocable': '模型可用',
  'capabilities.skill.userOnly': '仅用户',
  'capabilities.close': '关闭',
  'account.switch': '切换账号',
  'account.switching': '正在切换…',
  'account.none': '未登录',
  'account.loading': '读取账号…',
} satisfies Record<string, string>

/** 本包的 locale 键集合。 */
export type AcasxKey = keyof typeof zh

/** 英文字典，按中文键集合校验完整性。 */
export const en = {
  'hero.mainConversation': 'Main conversation',
  'hero.dailySupervision': 'Daily supervision',
  'hero.xindun': 'Xindun',
  'hero.preview': 'Preview',
  'capabilities.title': 'Current conversation capabilities',
  'capabilities.mcp': 'MCP',
  'capabilities.skills': 'Skills',
  'capabilities.loading': 'Loading…',
  'capabilities.error': 'Failed to load capabilities',
  'capabilities.mcp.empty': 'This conversation uses no MCP server',
  'capabilities.skills.empty': 'This conversation loaded no skill',
  'capabilities.skill.modelInvocable': 'Model invocable',
  'capabilities.skill.userOnly': 'User only',
  'capabilities.close': 'Close',
  'account.switch': 'Switch account',
  'account.switching': 'Switching…',
  'account.none': 'Not signed in',
  'account.loading': 'Loading account…',
} satisfies Record<AcasxKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** ACAS.X 产品界面文案。 */
    acasx: AcasxKey
  }
}
