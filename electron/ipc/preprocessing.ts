import { ipcMain } from 'electron'
import { join } from 'node:path'
import type { PreprocessSettings } from '../../src/types/preprocessing.js'
import { preprocessImage } from '../services/image-preprocessor.js'
import type { ProjectStore } from '../services/project-store.js'

export function registerPreprocessingIpc(projectStore: ProjectStore, userDataPath: string) {
  ipcMain.handle('lora-studio:prepare-images', async (_event, settings: PreprocessSettings) => {
    await projectStore.loadProject()
    const projectId = projectStore.getProjectId()
    if (!projectId) throw new Error('Select an image folder before preparing images.')
    const outputDirectory = join(userDataPath, 'projects', projectId, 'processed-images')
    const results = []

    for (const image of projectStore.getProjectImages()) {
      results.push(await preprocessImage({
        imageId: image.id,
        sourcePath: image.sourcePath,
        outputDirectory,
        settings,
      }))
    }

    return projectStore.savePreparationResults(results)
  })
}
