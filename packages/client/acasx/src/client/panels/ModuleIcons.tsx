/** 业务导航条目的图标。 */

/**
 * 渲染「主对话」图标。
 * @param props - 侧栏要求的图标边长。
 * @returns 图标。
 */
export function ChatIcon({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5V10.5h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 渲染「档案-资料库」图标。
 * @param props - 侧栏要求的图标边长。
 * @returns 图标。
 */
export function ArchiveIcon({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11v8h-11z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2.5 7h11M6 4.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 渲染「技能-连接器」图标。
 * @param props - 侧栏要求的图标边长。
 * @returns 图标。
 */
export function ConnectorIcon({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 2.5v3M11 2.5v3M3.5 5.5h9v2a4.5 4.5 0 0 1-9 0z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 12v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 渲染「更多」图标。
 * @param props - 侧栏要求的图标边长。
 * @returns 图标。
 */
export function MoreIcon({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}
