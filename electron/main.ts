import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { RuntimeInfo } from '../src/desktop-api.js'
import { registerProjectIpc } from './ipc/project.js'
import { registerPreprocessingIpc } from './ipc/preprocessing.js'
import { registerModelIpc } from './ipc/models.js'
import { ModelManager, type ModelManifest } from './services/model-manager.js'
import { ProjectStore } from './services/project-store.js'
import { getTextRemovalEngineStatus } from './services/image-inpainter.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.LORA_STUDIO_RENDERER_URL
let projectStore: ProjectStore

protocol.registerSchemesAsPrivileged([{
  scheme: 'lora-image',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    stream: true,
  },
}])

function registerDesktopIpc() {
  ipcMain.handle('lora-studio:get-runtime-info', (): RuntimeInfo => ({
    environment: 'electron',
    platform: process.platform,
  }))
  ipcMain.handle('lora-studio:get-text-removal-status', () => (
    getTextRemovalEngineStatus(path.resolve(currentDirectory, '../..'))
  ))
}

function registerImageProtocol() {
  protocol.handle('lora-image', (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'image') return new Response('Not found', { status: 404 })
    const imageId = decodeURIComponent(url.pathname.slice(1))
    const previewPath = projectStore.getPreviewPath(imageId)
    if (!previewPath) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(previewPath).toString())
  })
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: '#10100e',
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.resolve(currentDirectory, '../../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData')
  projectStore = new ProjectStore(path.join(userDataPath, 'project-state.json'))
  registerDesktopIpc()
  registerProjectIpc(projectStore)
  registerPreprocessingIpc(projectStore, userDataPath)
  const manifestPath = app.isPackaged
    ? path.join(process.resourcesPath, 'models', 'wd14-manifest.json')
    : path.resolve(currentDirectory, '../../resources/models/wd14-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ModelManifest
  registerModelIpc(new ModelManager(path.join(userDataPath, 'models', 'wd14'), manifest))
  registerImageProtocol()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
