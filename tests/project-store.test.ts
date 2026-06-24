import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ProjectStore } from '../electron/services/project-store'

describe('ProjectStore', () => {
  it('creates safe renderer metadata without changing source images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-project-store-'))
    const imageFolder = join(root, 'source-images')
    const stateFile = join(root, 'user-data', 'project-state.json')
    const sourcePath = join(imageFolder, 'portrait.jpg')
    const sourceBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x02])

    await mkdir(imageFolder, { recursive: true })
    await writeFile(sourcePath, sourceBytes)

    const store = new ProjectStore(stateFile)
    const project = await store.createProjectFromFolder(imageFolder)

    expect(await readFile(sourcePath)).toEqual(sourceBytes)
    expect(project.folderName).toBe('source-images')
    expect(project.images).toHaveLength(1)
    expect(project.images[0]).toMatchObject({
      name: 'portrait.jpg',
      status: 'queued',
      tags: [],
      originalTags: [],
      selected: true,
    })
    expect(project.images[0].previewUrl).toMatch(/^lora-image:\/\/image\//)
    expect(JSON.stringify(project)).not.toContain(root)
  })

  it('restores edited state while keeping source paths private', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-project-restore-'))
    const imageFolder = join(root, 'images')
    const stateFile = join(root, 'user-data', 'project-state.json')
    await mkdir(imageFolder, { recursive: true })
    await writeFile(join(imageFolder, 'one.png'), Buffer.from('source-image'))

    const store = new ProjectStore(stateFile)
    const project = await store.createProjectFromFolder(imageFolder)
    project.images[0].tags = [{ name: 'blue_eyes', category: 'general', confidence: 1 }]
    project.images[0].selected = false
    project.images[0].status = 'ready'
    await store.saveProject(project)

    const restoredStore = new ProjectStore(stateFile)
    const restored = await restoredStore.loadProject()

    expect(restored).toEqual(project)
    expect(restoredStore.getSourcePath(project.images[0].id)).toBe(join(imageFolder, 'one.png'))
    expect(JSON.stringify(restored)).not.toContain(root)
  })

  it('persists private batch state without exposing raw responses in the project DTO', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-project-batch-'))
    const imageFolder = join(root, 'images')
    const stateFile = join(root, 'user-data', 'project-state.json')
    await mkdir(imageFolder, { recursive: true })
    await writeFile(join(imageFolder, 'one.jpg'), Buffer.from('source-image'))
    const store = new ProjectStore(stateFile)
    const project = await store.createProjectFromFolder(imageFolder)
    const batchState = {
      providerId: 'local-wd14' as const,
      trainingType: 'character' as const,
      threshold: 0.35,
      items: {
        [project.images[0].id]: {
          imageId: project.images[0].id,
          status: 'ready' as const,
          result: {
            imageId: project.images[0].id,
            providerId: 'local-wd14' as const,
            tags: [],
            rawResponse: { privateModelOutput: true },
          },
        },
      },
    }

    await store.saveBatchState(batchState)
    const restoredStore = new ProjectStore(stateFile)

    expect(await restoredStore.loadBatchState()).toEqual(batchState)
    expect(JSON.stringify(await restoredStore.loadProject())).not.toContain('privateModelOutput')
  })

  it('marks failed preparation results without clearing successful processed images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-project-prep-failures-'))
    const imageFolder = join(root, 'images')
    const stateFile = join(root, 'user-data', 'project-state.json')
    await mkdir(imageFolder, { recursive: true })
    await writeFile(join(imageFolder, 'one.jpg'), Buffer.from('source-one'))
    await writeFile(join(imageFolder, 'two.jpg'), Buffer.from('source-two'))

    const store = new ProjectStore(stateFile)
    const project = await store.createProjectFromFolder(imageFolder)
    const saved = await store.savePreparationResults([
      {
        imageId: project.images[0].id,
        mode: 'preserve-aspect',
        originalDimensions: { width: 512, height: 512 },
        outputDimensions: { width: 512, height: 512 },
        outputFilename: 'one.jpg',
        outputPath: join(root, 'processed', 'one.jpg'),
        processedAt: '2026-06-20T00:00:00.000Z',
      },
      {
        imageId: project.images[1].id,
        error: 'Inpainting failed',
      },
    ])

    expect(saved.images[0]).toMatchObject({ status: 'prepared', preparation: { outputFilename: 'one.jpg' } })
    expect(saved.images[1]).toMatchObject({ status: 'failed', error: 'Inpainting failed' })
    expect(saved.images[1].preparation).toBeUndefined()
  })
})
