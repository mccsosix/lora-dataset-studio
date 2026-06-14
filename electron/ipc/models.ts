import { ipcMain } from 'electron'
import type { ModelManager } from '../services/model-manager.js'

export function registerModelIpc(modelManager: ModelManager) {
  ipcMain.handle('lora-studio:get-model-status', () => modelManager.getStatus())
  ipcMain.handle('lora-studio:install-recommended-model', (event) => modelManager.install((progress) => {
    event.sender.send('lora-studio:model-progress', progress)
  }))
  ipcMain.handle('lora-studio:remove-model', () => modelManager.remove())
}
