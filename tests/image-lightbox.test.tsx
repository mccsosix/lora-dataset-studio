import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ImageLightbox } from '../src/components/ImageLightbox'

describe('ImageLightbox', () => {
  it('renders an accessible full-image viewer with zoom and close controls', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ name: 'portrait.jpg', url: 'blob:portrait' }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('查看大图 portrait.jpg')
    expect(markup).toContain('缩小图片')
    expect(markup).toContain('恢复原始大小')
    expect(markup).toContain('放大图片')
    expect(markup).toContain('关闭大图')
    expect(markup).toContain('Esc 退出')
    expect(markup).toContain('blob:portrait')
  })

  it('renders nothing when no image is selected', () => {
    expect(renderToStaticMarkup(<ImageLightbox image={null} onClose={() => undefined} />)).toBe('')
  })

  it('shows text-removal editing guidance when enabled', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ id: 'image-1', name: 'portrait.jpg', url: 'blob:portrait' }}
        textRemoval={{
          regions: [{ id: 'region-1', confidence: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
          onAddRegion: () => undefined,
          onRemoveRegion: () => undefined,
          onClearRegions: () => undefined,
          onPrepare: () => undefined,
        }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('大图去水印编辑')
    expect(markup).toContain('点击或拖拽图片框选文字 / 水印')
    expect(markup).toContain('已选 1 个区域')
    expect(markup).toContain('准备图片')
    expect(markup).toContain('删除区域 1')
  })

  it('renders the updated prepared image URL while the editor stays open', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ id: 'image-1', name: 'portrait.jpg', url: 'lora-image://image/image-1?v=prepared' }}
        textRemoval={{
          regions: [],
          onAddRegion: () => undefined,
          onRemoveRegion: () => undefined,
          onClearRegions: () => undefined,
          onPrepare: () => undefined,
        }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('lora-image://image/image-1?v=prepared')
  })

  it('shows why preparing is unavailable inside the editor', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ id: 'image-1', name: 'portrait.jpg', url: 'blob:portrait' }}
        textRemoval={{
          regions: [{ id: 'region-1', confidence: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
          prepareStatus: '网页模式只能预览框选区域；要运行 LaMA 去水印，请打开桌面应用。',
          onAddRegion: () => undefined,
          onRemoveRegion: () => undefined,
          onClearRegions: () => undefined,
          onPrepare: () => undefined,
        }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('网页模式只能预览框选区域')
    expect(markup).toContain('准备图片')
    expect(markup).toContain('<button type="button">准备图片</button>')
  })

  it('shows an animated busy state while preparing the cleaned image', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ id: 'image-1', name: 'portrait.jpg', url: 'blob:portrait' }}
        textRemoval={{
          regions: [{ id: 'region-1', confidence: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
          prepareBusy: true,
          onAddRegion: () => undefined,
          onRemoveRegion: () => undefined,
          onClearRegions: () => undefined,
          onPrepare: () => undefined,
        }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('LaMA 正在修复')
    expect(markup).toContain('lightbox-progress')
    expect(markup).toContain('正在准备')
  })

  it('shows a success treatment after preparing the cleaned image', () => {
    const markup = renderToStaticMarkup(
      <ImageLightbox
        image={{ id: 'image-1', name: 'portrait.jpg', url: 'blob:portrait' }}
        textRemoval={{
          regions: [{ id: 'region-1', confidence: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
          prepareStatus: '当前图已用 LaMA 处理 1 个区域。',
          prepareTone: 'success',
          onAddRegion: () => undefined,
          onRemoveRegion: () => undefined,
          onClearRegions: () => undefined,
          onPrepare: () => undefined,
        }}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('修复完成')
    expect(markup).toContain('lightbox-edit-status success')
    expect(markup).toContain('当前图已用 LaMA 处理 1 个区域。')
  })
})
