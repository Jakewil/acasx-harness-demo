/** ACAS.X 客户端读取 Electron 桌面账号桥的最小接口。 */

/** 桌面端当前登录账号的安全视图。 */
export interface AcasxDesktopAccount {
  /** 稳定账号 id。 */
  readonly id: string
  /** 登录用户名。 */
  readonly username: string
  /** 界面显示名。 */
  readonly displayName: string
}

/** 桌面端暴露给 ACAS.X 客户端的账号操作。 */
export interface AcasxDesktopAccountBridge {
  /** @returns 当前账号；未登录时为 null。 */
  currentAccount(): Promise<AcasxDesktopAccount | null>
  /** 停止当前 Host 并返回登录门。 */
  switchAccount(): Promise<void>
}

/**
 * 读取桌面账号桥；Web 调试环境没有该桥。
 * @returns 桌面桥，或 undefined。
 */
export function desktopAccountBridge(): AcasxDesktopAccountBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { dshDesktop?: { acasx?: AcasxDesktopAccountBridge } }).dshDesktop?.acasx
}
