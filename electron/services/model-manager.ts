import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ModelDownloadProgress, ModelStatus } from '../../src/types/model.js'

export type { ModelDownloadProgress, ModelStatus } from '../../src/types/model.js'

export type ModelManifestFile = {
  name: string
  url: string
  size: number
  sha256: string
}

export type ModelManifest = {
  id: string
  name: string
  version: string
  licenseUrl: string
  files: ModelManifestFile[]
}

type DownloadFile = (
  url: string,
  destination: string,
  onChunk?: (bytes: number) => void,
) => Promise<void>

export class ModelManager {
  constructor(
    private readonly rootDirectory: string,
    private readonly manifest: ModelManifest,
    private readonly downloadFile: DownloadFile = streamDownload,
  ) {}

  async getStatus(): Promise<ModelStatus> {
    const base = this.baseStatus()
    const external = await this.readJson<{ directory: string }>(join(this.rootDirectory, 'external.json'))
    if (external) {
      if (await isCompatibleModelDirectory(external.directory)) {
        const name = basename(external.directory)
        return { ...base, state: 'external', name, installedVersion: name }
      }
      return { ...base, state: 'corrupt', installedVersion: basename(external.directory) }
    }
    const current = await this.readJson<{ version: string }>(join(this.rootDirectory, 'current.json'))
    if (!current) {
      return await pathExists(this.partialDirectory()) ? { ...base, state: 'partial' } : { ...base, state: 'absent' }
    }

    const installedManifest = await this.readJson<ModelManifest>(join(this.rootDirectory, current.version, 'manifest.json'))
    if (!installedManifest || !await this.verifyDirectory(join(this.rootDirectory, current.version), installedManifest)) {
      return { ...base, state: 'corrupt', installedVersion: current.version }
    }

    const error = await this.readJson<{ version: string; message: string }>(join(this.rootDirectory, 'last-error.json'))
    if (error?.version === this.manifest.version && current.version !== this.manifest.version) {
      return { ...base, state: 'upgrade-failed', installedVersion: current.version, error: error.message }
    }
    if (current.version !== this.manifest.version) {
      return { ...base, state: 'upgrade-available', installedVersion: current.version }
    }
    return { ...base, state: 'ready', installedVersion: current.version }
  }

  async install(onProgress?: (progress: ModelDownloadProgress) => void): Promise<ModelStatus> {
    await mkdir(this.rootDirectory, { recursive: true })
    const partialDirectory = this.partialDirectory()
    await rm(partialDirectory, { recursive: true, force: true })
    await mkdir(partialDirectory, { recursive: true })
    let downloadedBytes = 0

    try {
      for (const file of this.manifest.files) {
        const safeName = basename(file.name)
        if (safeName !== file.name) throw new Error(`Unsafe model filename: ${file.name}`)
        await this.downloadFile(file.url, join(partialDirectory, safeName), (chunkBytes) => {
          downloadedBytes += chunkBytes
          onProgress?.({ downloadedBytes, totalBytes: this.totalBytes(), fileName: safeName })
        })
        if (!onProgress) continue
        const actualSize = (await stat(join(partialDirectory, safeName))).size
        const missingBytes = actualSize - (downloadedBytes - this.completedFileBytes(file.name))
        if (missingBytes > 0) {
          downloadedBytes += missingBytes
          onProgress({ downloadedBytes, totalBytes: this.totalBytes(), fileName: safeName })
        }
      }

      if (!await this.verifyDirectory(partialDirectory, this.manifest)) throw new Error('Downloaded model failed checksum verification.')
      await writeFile(join(partialDirectory, 'manifest.json'), JSON.stringify(this.manifest, null, 2), 'utf8')

      const versionDirectory = join(this.rootDirectory, this.manifest.version)
      const backupDirectory = join(this.rootDirectory, `${this.manifest.version}.backup`)
      await rm(backupDirectory, { recursive: true, force: true })
      if (await pathExists(versionDirectory)) await rename(versionDirectory, backupDirectory)
      try {
        await rename(partialDirectory, versionDirectory)
      } catch (error) {
        if (await pathExists(backupDirectory)) await rename(backupDirectory, versionDirectory)
        throw error
      }
      await this.writeJsonAtomic('current.json', { version: this.manifest.version })
      await rm(backupDirectory, { recursive: true, force: true })
      await rm(join(this.rootDirectory, 'external.json'), { force: true })
      await rm(join(this.rootDirectory, 'last-error.json'), { force: true })
      return this.getStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Model download failed.'
      await writeFile(join(this.rootDirectory, 'last-error.json'), JSON.stringify({ version: this.manifest.version, message }, null, 2), 'utf8')
      throw error
    }
  }

  async remove(): Promise<ModelStatus> {
    await rm(this.rootDirectory, { recursive: true, force: true })
    return this.getStatus()
  }

  async useExistingDirectory(directory: string): Promise<ModelStatus> {
    const missing = await missingCompatibleModelFiles(directory)
    if (missing.length) throw new Error(`Existing WD14 model is missing: ${missing.join(', ')}`)
    await mkdir(this.rootDirectory, { recursive: true })
    await this.writeJsonAtomic('external.json', { directory })
    await rm(join(this.rootDirectory, 'current.json'), { force: true })
    return this.getStatus()
  }

  async getActiveModelDirectory(): Promise<string | null> {
    const external = await this.readJson<{ directory: string }>(join(this.rootDirectory, 'external.json'))
    if (external && await isCompatibleModelDirectory(external.directory)) return external.directory
    const current = await this.readJson<{ version: string }>(join(this.rootDirectory, 'current.json'))
    if (!current) return null
    const directory = join(this.rootDirectory, current.version)
    return await pathExists(directory) ? directory : null
  }

  private partialDirectory() {
    return join(this.rootDirectory, `${this.manifest.version}.partial`)
  }

  private totalBytes() {
    return this.manifest.files.reduce((total, file) => total + file.size, 0)
  }

  private completedFileBytes(currentName: string) {
    const index = this.manifest.files.findIndex((file) => file.name === currentName)
    return this.manifest.files.slice(0, index).reduce((total, file) => total + file.size, 0)
  }

  private baseStatus(): Omit<ModelStatus, 'state'> {
    return {
      name: this.manifest.name,
      recommendedVersion: this.manifest.version,
      totalBytes: this.totalBytes(),
      licenseUrl: this.manifest.licenseUrl,
    }
  }

  private async verifyDirectory(directory: string, manifest: ModelManifest) {
    for (const file of manifest.files) {
      const filePath = join(directory, basename(file.name))
      try {
        if ((await stat(filePath)).size !== file.size) return false
        if (await hashFile(filePath) !== file.sha256.toLowerCase()) return false
      } catch {
        return false
      }
    }
    return true
  }

  private async writeJsonAtomic(name: string, value: unknown) {
    const temporaryPath = join(this.rootDirectory, `${name}.tmp`)
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
    await rm(join(this.rootDirectory, name), { force: true })
    await rename(temporaryPath, join(this.rootDirectory, name))
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function missingCompatibleModelFiles(directory: string) {
  const missing: string[] = []
  for (const name of ['model.onnx', 'selected_tags.csv']) {
    try {
      if ((await stat(join(directory, name))).size <= 0) missing.push(name)
    } catch {
      missing.push(name)
    }
  }
  return missing
}

export async function isCompatibleModelDirectory(directory: string) {
  return (await missingCompatibleModelFiles(directory)).length === 0
}

async function hashFile(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function streamDownload(url: string, destination: string, onChunk?: (bytes: number) => void) {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}.`)
  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onChunk?.(chunk.length)
      callback(null, chunk)
    },
  })
  await pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>), progress, createWriteStream(destination))
}
