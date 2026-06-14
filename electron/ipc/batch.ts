import { BrowserWindow } from 'electron'
import type { BatchProgressEvent } from '../../src/types/tagging.js'

export function publishBatchProgress(event: BatchProgressEvent) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('lora-studio:batch-progress', event)
  }
}
