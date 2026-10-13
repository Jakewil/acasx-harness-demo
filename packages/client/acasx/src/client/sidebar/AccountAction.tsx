/** ACAS.X 侧栏底部账号入口：显示当前账号并切换登录。 */

import { useEffect, useState } from 'react'
import { IconUserOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { desktopAccountBridge, type AcasxDesktopAccount } from '../desktop-account.ts'

type AccountState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly account: AcasxDesktopAccount | null }
  | { readonly status: 'error' }

/**
 * 侧栏底部账号入口。
 * @param props - 侧栏宽度与 ACAS.X locale seat。
 * @returns 桌面端账号按钮；Web 环境不渲染。
 */
export function AcasxAccountAction({ wide, t }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'acasx'>) {
  const [state, setState] = useState<AccountState>({ status: 'loading' })
  const [switching, setSwitching] = useState(false)
  useEffect(() => {
    const bridge = desktopAccountBridge()
    if (bridge === undefined) return
    let cancelled = false
    void bridge.currentAccount().then(
      (account) => {
        if (!cancelled) setState({ status: 'ready', account })
      },
      () => {
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => { cancelled = true }
  }, [])
  const bridge = desktopAccountBridge()
  if (bridge === undefined) return null
  const label = state.status === 'ready' && state.account !== null
    ? state.account.displayName
    : state.status === 'loading' ? t('account.loading') : t('account.none')
  const switchLabel = switching ? t('account.switching') : t('account.switch')
  return (
    <button
      type="button"
      title={`${label} · ${switchLabel}`}
      aria-label={switchLabel}
      disabled={switching || state.status === 'loading'}
      onClick={() => {
        setSwitching(true)
        void bridge.switchAccount().catch(() => { setSwitching(false) })
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 8px',
        border: 0,
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: switching ? 'default' : 'pointer',
        opacity: switching ? 0.6 : 1,
      }}
    >
      <IconUserOutlineMedium size={16} />
      {wide && <span>{label} · {switchLabel}</span>}
    </button>
  )
}
