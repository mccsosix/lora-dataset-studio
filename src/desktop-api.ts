export type RuntimeInfo = {
  environment: 'browser' | 'electron'
  platform: string
}

export interface DesktopApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
}

export const desktopApiMethodNames = ['getRuntimeInfo'] as const satisfies ReadonlyArray<keyof DesktopApi>

type DesktopInvoke = (channel: string) => Promise<unknown>

export function createDesktopApi(invoke: DesktopInvoke): DesktopApi {
  return {
    async getRuntimeInfo() {
      return await invoke('lora-studio:get-runtime-info') as RuntimeInfo
    },
  }
}

export const browserDesktopApi: DesktopApi = {
  async getRuntimeInfo() {
    return {
      environment: 'browser',
      platform: 'browser',
    }
  },
}

declare global {
  interface Window {
    loraStudio?: DesktopApi
  }
}

export function getDesktopApi(): DesktopApi {
  return window.loraStudio ?? browserDesktopApi
}
