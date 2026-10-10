/** 占据侧栏品牌名槽位的 ACAS.X 字标。 */
import type { SidebarBrandNameOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 用 ACAS.X 产品名替换上游字标。
 * @param props - 空的 owner 数据；占位者自己决定内容。
 * @returns ACAS.X 字标。
 */
export function AcasxBrandName(_props: SidebarBrandNameOwnerProps) {
  return <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: 0 }}>ACAS.X</span>
}
