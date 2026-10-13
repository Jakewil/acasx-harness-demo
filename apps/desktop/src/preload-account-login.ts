/** Isolated preload for the ACAS.X desktop account login window. */

import { contextBridge, ipcRenderer } from 'electron'
import { ACASX_LOGIN_IPC, type AcasxLoginApi } from './account-login-api.ts'

const api: AcasxLoginApi = {
  submit: (username, password) => ipcRenderer.invoke(ACASX_LOGIN_IPC.submit, { username, password }),
}

contextBridge.exposeInMainWorld('acasxLogin', api)
