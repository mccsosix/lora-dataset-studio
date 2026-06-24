import { ipcMain } from 'electron'
import { join } from 'node:path'
import type { PreprocessSettings } from '../../src/types/preprocessing.js'
import { preprocessImage, type PreprocessImageFailure } from '../services/image-preprocessor.js'
import type { ProjectStore } from '../services/project-store.js'
import { detectTextRegionsInImage } from '../services/text-region-detector.js'
import { TextRemovalPreprocessor } from '../services/text-removal-preprocessor.js'
import { publishBatchProgress } from './batch.js'

export function registerPreprocessingIpc(projectStore: ProjectStore, userDataPath: string) {
  ipcMain.handle('lora-studio:prepare-images', async (_event, settings: PreprocessSettings) => {
    await projectStore.loadProject()
    const projectId = projectStore.getProjectId()
    if (!projectId) throw new Error('Select an image folder before preparing images.')
    const outputDirectory = join(userDataPath, 'projects', projectId, 'processed-images')
    const cleanedDirectory = join(userDataPath, 'projects', projectId, 'cleaned-images')
    const textRemoval = new TextRemovalPreprocessor()
    const results = []
    const requestedImageIds = settings.imageIds ? new Set(settings.imageIds) : null
    const projectImages = requestedImageIds
      ? projectStore.getProjectImages().filter((image) => requestedImageIds.has(image.id))
      : projectStore.getProjectImages()

    for (const [index, image] of projectImages.entries()) {
      try {
        publishBatchProgress({
          phase: 'prepare',
          imageId: image.id,
          fileName: image.name,
          status: 'preparing',
          completed: index,
          total: projectImages.length,
        })
        const textRemovalResult = settings.textRemoval
          ? await textRemoval.removeManualRegions({
            imageId: image.id,
            sourcePath: image.sourcePath,
            outputDirectory: cleanedDirectory,
            settings: {
              ...settings.textRemoval,
              manualRegions: settings.textRemoval.manualRegionsByImageId?.[image.id] ?? settings.textRemoval.manualRegions,
            },
          })
          : null
        results.push(await preprocessImage({
          imageId: image.id,
          sourcePath: image.sourcePath,
          workingSourcePath: textRemovalResult?.cleanedPath,
          textRemovalResult: textRemovalResult ?? undefined,
          outputDirectory,
          settings,
        }))
        publishBatchProgress({
          phase: 'prepare',
          imageId: image.id,
          fileName: image.name,
          status: 'ready',
          completed: index + 1,
          total: projectImages.length,
        })
      } catch (error) {
        publishBatchProgress({
          phase: 'prepare',
          imageId: image.id,
          fileName: image.name,
          status: 'failed',
          completed: index + 1,
          total: projectImages.length,
          error: error instanceof Error ? error.message : 'Image preparation failed.',
        })
        results.push({
          imageId: image.id,
          error: error instanceof Error ? error.message : 'Image preparation failed.',
        } satisfies PreprocessImageFailure)
      }
    }

    return projectStore.savePreparationResults(results)
  })

  ipcMain.handle('lora-studio:detect-text-regions', async (_event, imageIds?: string[]) => {
    await projectStore.loadProject()
    const projectId = projectStore.getProjectId()
    if (!projectId) throw new Error('Select an image folder before detecting text regions.')
    const regionsByImageId = {} as Record<string, Awaited<ReturnType<typeof detectTextRegionsInImage>>>
    const requestedImageIds = imageIds ? new Set(imageIds) : null
    const projectImages = requestedImageIds
      ? projectStore.getProjectImages().filter((image) => requestedImageIds.has(image.id))
      : projectStore.getProjectImages()
    for (const [index, image] of projectImages.entries()) {
      publishBatchProgress({
        phase: 'detect-text',
        imageId: image.id,
        fileName: image.name,
        status: 'preparing',
        completed: index,
        total: projectImages.length,
      })
      regionsByImageId[image.id] = await detectTextRegionsInImage({
        imageId: image.id,
        sourcePath: image.sourcePath,
      })
      publishBatchProgress({
        phase: 'detect-text',
        imageId: image.id,
        fileName: image.name,
        status: 'ready',
        completed: index + 1,
        total: projectImages.length,
      })
    }
    return regionsByImageId
  })
}
