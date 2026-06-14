import { contextBridge, ipcRenderer } from 'electron'
import { createDesktopApi } from '../src/desktop-api.js'

contextBridge.exposeInMainWorld('loraStudio', createDesktopApi(
  (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  (channel, callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
))
