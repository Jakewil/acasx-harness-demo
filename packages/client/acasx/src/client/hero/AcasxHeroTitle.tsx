/** ACAS.X hero 标题：按当前会话的 agent preset 映射场景名。 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// 类型-only：引入 ui-conversation 的 slot 声明。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** hero 标题 occupant 的完整 props。 */
export type AcasxHeroTitleProps = PropsRuntime<'conversation.hero.headline'> & PropsLocale<'acasx'>

/**
 * 把 preset id 映射成标题文案。
 * @param preset - 当前会话记录的 preset id。
 * @param t - ACAS.X locale seat。
 * @returns 标题文案；未知 preset 回退到主对话。
 */
export function titleForPreset(preset: string | null | undefined, t: AcasxHeroTitleProps['t']): string {
  if (preset === 'richang-jianguan') return t('hero.dailySupervision')
  if (preset === 'xindun') return t('hero.xindun')
  return t('hero.mainConversation')
}

/**
 * 渲染 hero 标题。
 * @param props - session-maybe 标准 props 与 ACAS.X locale seat。
 * @returns 标题元素。
 */
export function AcasxHeroTitle({ sessionId, useSessions, t }: AcasxHeroTitleProps) {
  const preset = useSessions((state) => {
    if (sessionId === undefined) return undefined
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' ? value : undefined
  })
  return <span>{titleForPreset(preset, t)}</span>
}
