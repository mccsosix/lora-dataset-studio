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
})
