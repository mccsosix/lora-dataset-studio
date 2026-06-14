import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModelSetupPanel } from '../src/components/ModelSetupPanel'

describe('ModelSetupPanel', () => {
  it('shows recommended model size, license, and download action when absent', () => {
    const markup = renderToStaticMarkup(
      <ModelSetupPanel
        status={{
          state: 'absent',
          name: 'WD SwinV2 Tagger v3',
          recommendedVersion: 'abc123',
          totalBytes: 467769446,
          licenseUrl: 'https://example.com/license',
        }}
        progress={null}
        isBusy={false}
        onInstall={() => undefined}
        onRemove={() => undefined}
      />,
    )

    expect(markup).toContain('WD SwinV2 Tagger v3')
    expect(markup).toContain('446.1 MiB')
    expect(markup).toContain('查看模型许可')
    expect(markup).toContain('下载推荐模型')
  })

  it('shows installed version and remove action when ready', () => {
    const markup = renderToStaticMarkup(
      <ModelSetupPanel
        status={{
          state: 'ready',
          name: 'WD14',
          recommendedVersion: '2.0.0',
          installedVersion: '2.0.0',
          totalBytes: 100,
          licenseUrl: 'https://example.com/license',
        }}
        progress={null}
        isBusy={false}
        onInstall={() => undefined}
        onRemove={() => undefined}
      />,
    )

    expect(markup).toContain('本地模型已就绪')
    expect(markup).toContain('2.0.0')
    expect(markup).toContain('移除模型')
  })

  it('shows download progress and retryable errors', () => {
    const progressMarkup = renderToStaticMarkup(
      <ModelSetupPanel
        status={{ state: 'partial', name: 'WD14', recommendedVersion: '2', totalBytes: 100, licenseUrl: '#' }}
        progress={{ downloadedBytes: 40, totalBytes: 100, fileName: 'model.onnx' }}
        isBusy
        onInstall={() => undefined}
        onRemove={() => undefined}
      />,
    )
    const failedMarkup = renderToStaticMarkup(
      <ModelSetupPanel
        status={{ state: 'upgrade-failed', name: 'WD14', recommendedVersion: '2', installedVersion: '1', totalBytes: 100, licenseUrl: '#', error: 'network unavailable' }}
        progress={null}
        isBusy={false}
        onInstall={() => undefined}
        onRemove={() => undefined}
      />,
    )

    expect(progressMarkup).toContain('40%')
    expect(failedMarkup).toContain('旧版本仍然可用')
    expect(failedMarkup).toContain('重试下载')
  })
})
