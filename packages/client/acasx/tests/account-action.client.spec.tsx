// @vitest-environment jsdom
/** ACAS.X 侧栏底部账号入口：桌面账号展示与切换。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '../src/client/locales.ts'
import { AcasxAccountAction } from '../src/client/sidebar/AccountAction.tsx'

const t = ((key: string) => key) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const unusedHook = (() => { throw new Error('unused by account action test') }) as never
const kit = {
  useSessions: unusedHook,
  useSessionStatus: unusedHook,
  usePanelInfo,
  useSessionRetainInfo: () => undefined,
  useResource,
  useWorkspaces: unusedHook,
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'dshDesktop')
})

describe('ACAS.X 侧栏账号入口', () => {
  it('Web 调试环境不渲染底部账号入口', () => {
    const { container } = render(<AcasxAccountAction wide t={t} {...kit} />)
    expect(container.firstChild).toBeNull()
  })

  it('桌面环境显示当前账号并触发切换', async () => {
    const switchAccount = vi.fn(async () => {})
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        acasx: {
          currentAccount: async () => ({ id: 'alice', username: 'alice', displayName: 'Alice' }),
          switchAccount,
        },
      },
    })
    render(<AcasxAccountAction wide t={t} {...kit} />)
    expect(await screen.findByText('Alice · account.switch')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'account.switch' }))
    expect(switchAccount).toHaveBeenCalledTimes(1)
  })

  it('账号读取失败时显示未登录', async () => {
    Object.defineProperty(window, 'dshDesktop', {
      configurable: true,
      value: {
        acasx: {
          currentAccount: async () => { throw new Error('failed') },
          switchAccount: async () => {},
        },
      },
    })
    render(<AcasxAccountAction wide t={t} {...kit} />)
    expect(await screen.findByText('account.none · account.switch')).toBeTruthy()
  })
})
