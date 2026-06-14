import { contextBridge, ipcRenderer } from 'electron'
import { createDesktopApi } from '../src/desktop-api.js'

contextBridge.exposeInMainWorld('loraStudio', createDesktopApi((channel) => ipcRenderer.invoke(channel)))
