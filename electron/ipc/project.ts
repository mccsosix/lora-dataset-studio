import { dialog, ipcMain } from 'electron'
import type { ProjectDto } from '../../src/types/project.js'
import type { ProjectStore } from '../services/project-store.js'

export function registerProjectIpc(projectStore: ProjectStore) {
  ipcMain.handle('lora-studio:select-image-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select a folder of LoRA training images',
    })
    if (result.canceled || !result.filePaths[0]) return null
    return projectStore.createProjectFromFolder(result.filePaths[0])
  })

  ipcMain.handle('lora-studio:load-project', () => projectStore.loadProject())
  ipcMain.handle('lora-studio:save-project', (_event, project: ProjectDto) => projectStore.saveProject(project))
}
