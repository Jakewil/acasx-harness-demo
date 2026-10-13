/** Native ACAS.X account login window and its isolated preload. */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions, type IpcMainInvokeEvent } from 'electron'
import { ACASX_LOGIN_IPC, type AcasxLoginResult } from './account-login-api.ts'
import type { DesktopAccountLogin, DesktopAccountSession } from './account-session.ts'

/**
 * Resolve the fixed account login window options.
 * @returns sandboxed window options with the account-login preload.
 */
export function accountLoginWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 420,
    height: 560,
    useContentSize: true,
    center: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'ACAS.X',
    backgroundColor: '#F4F5F7',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload-account-login.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}

/**
 * Open the process's account login window and wait for one successful login.
 *
 * Closing the window without logging in resolves undefined; the caller owns
 * the decision to quit the application.
 * @param session - account store and verifier.
 * @param onWindow - receives the live login window and undefined after it closes.
 * @returns the successful login, or undefined when the window closes first.
 */
export async function openAccountLoginWindow(
  session: DesktopAccountSession,
  onWindow?: (window: BrowserWindow | undefined) => void,
): Promise<DesktopAccountLogin | undefined> {
  const window = new BrowserWindow(accountLoginWindowOptions())
  onWindow?.(window)
  let settled = false
  let finish: (login: DesktopAccountLogin | undefined) => void = () => {}
  const result = new Promise<DesktopAccountLogin | undefined>((resolve) => { finish = resolve })
  const dispose = (): void => { ipcMain.removeHandler(ACASX_LOGIN_IPC.submit) }
  const assertSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('desktop account login: rejected action from an unowned frame')
    }
  }
  ipcMain.handle(ACASX_LOGIN_IPC.submit, (event, payload: unknown): AcasxLoginResult => {
    assertSender(event)
    const input = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : undefined
    const username = typeof input?.username === 'string' ? input.username.trim() : ''
    const password = typeof input?.password === 'string' ? input.password : ''
    if (username === '' || password === '' || username.length > 256 || password.length > 256) {
      return { ok: false, code: 'invalid-input' }
    }
    const login = session.login(username, password)
    if (login === undefined) return { ok: false, code: 'invalid-credentials' }
    if (!settled) {
      settled = true
      finish(login)
      setTimeout(() => { if (!window.isDestroyed()) window.close() }, 350)
    }
    return { ok: true, account: login.account }
  })
  window.once('closed', () => {
    onWindow?.(undefined)
    dispose()
    if (!settled) {
      settled = true
      finish(undefined)
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  try {
    await window.loadFile(join(app.getAppPath(), 'renderer', 'account-login.html'))
  } catch (error) {
    dispose()
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
  if (!window.isDestroyed()) window.show()
  return result
}
