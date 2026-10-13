/** ACAS.X 主对话初始化选择的判定。 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { describe, expect, it } from 'vitest'
import { MAIN_CONVERSATION_PANEL, shouldOpenMainConversation } from '../src/client/main-conversation.ts'

describe('ACAS.X 主对话初始化', () => {
  it('把未选中面板与主对话 Key 都交给主对话', () => {
    expect(shouldOpenMainConversation(null)).toBe(true)
    expect(shouldOpenMainConversation(MAIN_CONVERSATION_PANEL.id)).toBe(true)
  })

  it('其它业务面板不触发主对话', () => {
    expect(shouldOpenMainConversation(brandString<MainPanelId>('acasx.rule-trial'))).toBe(false)
  })
})
