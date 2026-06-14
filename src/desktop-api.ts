import type { ProjectDto } from './types/project.js'
import type { PreprocessSettings } from './types/preprocessing.js'
import type { BatchProgressEvent } from './types/tagging.js'
import type { ModelDownloadProgress, ModelStatus } from './types/model.js'

export type RuntimeInfo = {
  environment: 'browser' | 'electron'
  platform: string
}

export interface DesktopApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
  selectImageFolder(): Promise<ProjectDto | null>
  loadProject(): Promise<ProjectDto | null>
  saveProject(project: ProjectDto): Promise<ProjectDto>
  prepareImages(settings: PreprocessSettings): Promise<ProjectDto>
  getModelStatus(): Promise<ModelStatus>
  installRecommendedModel(): Promise<ModelStatus>
  selectExistingModel(): Promise<ModelStatus | null>
  removeModel(): Promise<ModelStatus>
  onBatchProgress(callback: (event: BatchProgressEvent) => void): () => void
  onModelProgress(callback: (event: ModelDownloadProgress) => void): () => void
}

export const desktopApiMethodNames = [
  'getRuntimeInfo',
  'selectImageFolder',
  'loadProject',
  'saveProject',
  'prepareImages',
  'getModelStatus',
  'installRecommendedModel',
  'selectExistingModel',
  'removeModel',
  'onBatchProgress',
  'onModelProgress',
] as const satisfies ReadonlyArray<keyof DesktopApi>

type DesktopInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>
type DesktopSubscribe = (channel: string, callback: (event: unknown) => void) => () => void

export function createDesktopApi(invoke: DesktopInvoke, subscribe: DesktopSubscribe = () => () => undefined): DesktopApi {
  return {
    async getRuntimeInfo() {
      return await invoke('lora-studio:get-runtime-info') as RuntimeInfo
    },
    async selectImageFolder() {
      return await invoke('lora-studio:select-image-folder') as ProjectDto | null
    },
    async loadProject() {
      return await invoke('lora-studio:load-project') as ProjectDto | null
    },
    async saveProject(project) {
      return await invoke('lora-studio:save-project', project) as ProjectDto
    },
    async prepareImages(settings) {
      return await invoke('lora-studio:prepare-images', settings) as ProjectDto
    },
    async getModelStatus() {
      return await invoke('lora-studio:get-model-status') as ModelStatus
    },
    async installRecommendedModel() {
      return await invoke('lora-studio:install-recommended-model') as ModelStatus
    },
    async selectExistingModel() {
      return await invoke('lora-studio:select-existing-model') as ModelStatus | null
    },
    async removeModel() {
      return await invoke('lora-studio:remove-model') as ModelStatus
    },
    onBatchProgress(callback) {
      return subscribe('lora-studio:batch-progress', (event) => callback(event as BatchProgressEvent))
    },
    onModelProgress(callback) {
      return subscribe('lora-studio:model-progress', (event) => callback(event as ModelDownloadProgress))
    },
  }
}

let browserProject: ProjectDto | null = null

export const browserDesktopApi: DesktopApi = {
  async getRuntimeInfo() {
    return {
      environment: 'browser',
      platform: 'browser',
    }
  },
  async selectImageFolder() {
    const response = await fetch('/api/local-images')
    const data = await response.json() as {
      folderName: string
      images: Array<{ id: string; name: string; url: string }>
      error?: string
    }
    if (!response.ok) throw new Error(data.error || 'Unable to read the development image folder.')
    browserProject = {
      id: 'browser-development-project',
      folderName: data.folderName,
      images: data.images.map((image, index) => ({
        id: image.id,
        name: image.name,
        previewUrl: image.url,
        tags: [],
        originalTags: [],
        selected: index === 0,
        status: 'queued',
      })),
      updatedAt: new Date().toISOString(),
    }
    return browserProject
  },
  async loadProject() {
    return browserProject ?? browserDesktopApi.selectImageFolder()
  },
  async saveProject(project) {
    browserProject = project
    return project
  },
  async prepareImages() {
    throw new Error('Image preparation is available in the desktop application.')
  },
  async getModelStatus() {
    const response = await fetch('/api/model-status')
    if (response.ok) return await response.json() as ModelStatus
    return unavailableModelStatus()
  },
  async installRecommendedModel() {
    throw new Error('本地 WD14 模型下载仅在桌面应用中可用。')
  },
  async selectExistingModel() {
    throw new Error('网页模式请通过本地开发配置检测 WD14 模型。')
  },
  async removeModel() {
    return browserDesktopApi.getModelStatus()
  },
  onBatchProgress() {
    return () => undefined
  },
  onModelProgress() {
    return () => undefined
  },
}

function unavailableModelStatus(): ModelStatus {
  return {
    state: 'unavailable',
    name: '本地 WD14',
    recommendedVersion: '',
    totalBytes: 0,
    licenseUrl: '',
  }
}

declare global {
  interface Window {
    loraStudio?: DesktopApi
  }
}

export function getDesktopApi(): DesktopApi {
  return window.loraStudio ?? browserDesktopApi
}
