import { dialog, ipcMain } from 'electron'
import type { ModelManager } from '../services/model-manager.js'

export function registerModelIpc(modelManager: ModelManager) {
  ipcMain.handle('lora-studio:get-model-status', () => modelManager.getStatus())
  ipcMain.handle('lora-studio:install-recommended-model', (event) => modelManager.install((progress) => {
    event.sender.send('lora-studio:model-progress', progress)
  }))
  ipcMain.handle('lora-studio:select-existing-model', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择已有 WD14 模型目录',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return modelManager.useExistingDirectory(result.filePaths[0])
  })
  ipcMain.handle('lora-studio:remove-model', () => modelManager.remove())
}
