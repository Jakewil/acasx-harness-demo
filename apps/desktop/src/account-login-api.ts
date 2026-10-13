/** Private IPC contract for the ACAS.X desktop account login window. */

import type { AccountView } from '@deepseek-ai/dsh-client-acasx/account'

/** Channels installed only while the ACAS.X account login window exists. */
export const ACASX_LOGIN_IPC = {
  submit: 'dsh-acasx-login:submit',
} as const

/** One login attempt result shown by the isolated login renderer. */
export type AcasxLoginResult =
  | { readonly ok: true; readonly account: AccountView }
  | { readonly ok: false; readonly code: 'invalid-input' | 'invalid-credentials' }

/** API exposed by the login preload to the isolated renderer. */
export interface AcasxLoginApi {
  /**
   * Submit one login attempt.
   * @param username - entered username.
   * @param password - entered password.
   * @returns success with the safe account view, or a display message.
   */
  submit(username: string, password: string): Promise<AcasxLoginResult>
}
