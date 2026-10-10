/** 「规则试算」侧栏入口的图标。 */
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 按侧栏要求的尺寸渲染「规则试算」图标。
 * @param props - 侧栏要求的图标边长与选中状态。
 * @returns 模块图标。
 */
export function RuleTrialIcon({ size }: SidebarPanelIconOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12.5" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
