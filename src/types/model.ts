export type ModelState = 'unavailable' | 'absent' | 'partial' | 'ready' | 'external' | 'corrupt' | 'upgrade-available' | 'upgrade-failed'

export type ModelStatus = {
  state: ModelState
  name: string
  recommendedVersion: string
  installedVersion?: string
  totalBytes: number
  licenseUrl: string
  error?: string
}

export type ModelDownloadProgress = {
  downloadedBytes: number
  totalBytes: number
  fileName: string
}
