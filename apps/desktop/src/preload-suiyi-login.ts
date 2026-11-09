/** Isolated preload for the pre-workspace Suiyi login window; no account or Host operation is exposed. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type SuiyiLoginView, type SuiyiWelcomeApi } from './welcome-api.ts'

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop Suiyi login: missing window locale')

const api: SuiyiWelcomeApi = {
  ...resolveDesktopLocale(locale),
  suiyi: process.argv.includes('--dsh-suiyi-welcome-revisit') ? {
    returnToWorkspace: () => ipcRenderer.invoke(WELCOME_IPC.suiyiReturn) as Promise<void>,
  } : {
    start: () => ipcRenderer.invoke(WELCOME_IPC.suiyiStart) as Promise<void>,
    cancel: () => ipcRenderer.invoke(WELCOME_IPC.suiyiCancel) as Promise<void>,
    copyLink: () => ipcRenderer.invoke(WELCOME_IPC.suiyiCopyLink) as Promise<void>,
    onState: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, view: SuiyiLoginView): void => { listener(view) }
      ipcRenderer.on(WELCOME_IPC.suiyiState, receive)
      return () => { ipcRenderer.removeListener(WELCOME_IPC.suiyiState, receive) }
    },
  },
}
contextBridge.exposeInMainWorld('dshWelcome', api)
