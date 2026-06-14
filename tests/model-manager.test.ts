import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelManager, type ModelManifest } from '../electron/services/model-manager'

const modelBytes = Buffer.from('model-v1')
const tagsBytes = Buffer.from('name,category\nsolo,0\n')

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

function manifest(version = '1.0.0'): ModelManifest {
  return {
    id: 'wd14-test',
    name: 'WD14 Test Model',
    version,
    licenseUrl: 'https://example.com/license',
    files: [
      { name: 'model.onnx', url: 'https://example.com/model.onnx', size: modelBytes.length, sha256: sha256(modelBytes) },
      { name: 'selected_tags.csv', url: 'https://example.com/selected_tags.csv', size: tagsBytes.length, sha256: sha256(tagsBytes) },
    ],
  }
}

async function root() {
  return mkdtemp(join(tmpdir(), 'lora-model-manager-'))
}

const downloadFixture = async (url: string, destination: string) => {
  await writeFile(destination, url.endsWith('model.onnx') ? modelBytes : tagsBytes)
}

describe('ModelManager', () => {
  it('reports absent and partial model states', async () => {
    const directory = await root()
    const manager = new ModelManager(directory, manifest(), downloadFixture)

    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'absent', recommendedVersion: '1.0.0' })
    await mkdir(join(directory, '1.0.0.partial'), { recursive: true })
    await writeFile(join(directory, '1.0.0.partial', 'model.onnx'), modelBytes)

    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'partial', recommendedVersion: '1.0.0' })
  })

  it('downloads, verifies, and activates a ready model', async () => {
    const directory = await root()
    const progress: number[] = []
    const manager = new ModelManager(directory, manifest(), downloadFixture)

    const status = await manager.install((event) => progress.push(event.downloadedBytes))

    expect(status).toMatchObject({ state: 'ready', installedVersion: '1.0.0' })
    expect(progress.at(-1)).toBe(modelBytes.length + tagsBytes.length)
    expect(JSON.parse(await readFile(join(directory, 'current.json'), 'utf8'))).toEqual({ version: '1.0.0' })
  })

  it('reports a corrupt activated model', async () => {
    const directory = await root()
    const manager = new ModelManager(directory, manifest(), downloadFixture)
    await manager.install()
    await writeFile(join(directory, '1.0.0', 'model.onnx'), Buffer.from('corrupt'))

    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'corrupt', installedVersion: '1.0.0' })
  })

  it('reports an available upgrade without replacing the installed version', async () => {
    const directory = await root()
    await new ModelManager(directory, manifest('1.0.0'), downloadFixture).install()
    const manager = new ModelManager(directory, manifest('2.0.0'), downloadFixture)

    await expect(manager.getStatus()).resolves.toMatchObject({
      state: 'upgrade-available',
      installedVersion: '1.0.0',
      recommendedVersion: '2.0.0',
    })
  })

  it('keeps a working old version when an upgrade fails', async () => {
    const directory = await root()
    await new ModelManager(directory, manifest('1.0.0'), downloadFixture).install()
    const manager = new ModelManager(directory, manifest('2.0.0'), async () => {
      throw new Error('network unavailable')
    })

    await expect(manager.install()).rejects.toThrow('network unavailable')
    await expect(manager.getStatus()).resolves.toMatchObject({
      state: 'upgrade-failed',
      installedVersion: '1.0.0',
      recommendedVersion: '2.0.0',
      error: 'network unavailable',
    })
    expect(JSON.parse(await readFile(join(directory, 'current.json'), 'utf8'))).toEqual({ version: '1.0.0' })
  })

  it('keeps a working old version when an upgrade download is corrupt', async () => {
    const directory = await root()
    await new ModelManager(directory, manifest('1.0.0'), downloadFixture).install()
    const manager = new ModelManager(directory, manifest('2.0.0'), async (_url, destination) => {
      await writeFile(destination, Buffer.from('corrupt'))
    })

    await expect(manager.install()).rejects.toThrow('checksum')
    await expect(manager.getStatus()).resolves.toMatchObject({
      state: 'upgrade-failed',
      installedVersion: '1.0.0',
    })
    expect(JSON.parse(await readFile(join(directory, 'current.json'), 'utf8'))).toEqual({ version: '1.0.0' })
  })

  it('removes downloaded model data', async () => {
    const directory = await root()
    const manager = new ModelManager(directory, manifest(), downloadFixture)
    await manager.install()

    await expect(manager.remove()).resolves.toMatchObject({ state: 'absent' })
  })

  it('uses an existing compatible model directory without downloading it', async () => {
    const directory = await root()
    const externalDirectory = join(directory, 'existing-wd14')
    await mkdir(externalDirectory, { recursive: true })
    await writeFile(join(externalDirectory, 'model.onnx'), modelBytes)
    await writeFile(join(externalDirectory, 'selected_tags.csv'), tagsBytes)
    const manager = new ModelManager(join(directory, 'managed'), manifest(), async () => {
      throw new Error('download should not run')
    })

    const status = await manager.useExistingDirectory(externalDirectory)

    expect(status).toMatchObject({
      state: 'external',
      name: 'existing-wd14',
      installedVersion: 'existing-wd14',
    })
    expect(JSON.stringify(status)).not.toContain(directory)
    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'external' })
    await expect(manager.getActiveModelDirectory()).resolves.toBe(externalDirectory)
  })

  it('rejects an incompatible existing model directory', async () => {
    const directory = await root()
    const externalDirectory = join(directory, 'incomplete-wd14')
    await mkdir(externalDirectory, { recursive: true })
    await writeFile(join(externalDirectory, 'model.onnx'), modelBytes)
    const manager = new ModelManager(join(directory, 'managed'), manifest(), downloadFixture)

    await expect(manager.useExistingDirectory(externalDirectory)).rejects.toThrow('selected_tags.csv')
    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'absent' })
  })

  it('can replace an external model reference with the downloaded recommended model', async () => {
    const directory = await root()
    const externalDirectory = join(directory, 'existing-wd14')
    await mkdir(externalDirectory, { recursive: true })
    await writeFile(join(externalDirectory, 'model.onnx'), modelBytes)
    await writeFile(join(externalDirectory, 'selected_tags.csv'), tagsBytes)
    const manager = new ModelManager(join(directory, 'managed'), manifest(), downloadFixture)
    await manager.useExistingDirectory(externalDirectory)

    await manager.install()

    await expect(manager.getStatus()).resolves.toMatchObject({ state: 'ready', installedVersion: '1.0.0' })
    await expect(manager.getActiveModelDirectory()).resolves.toBe(join(directory, 'managed', '1.0.0'))
  })
})
