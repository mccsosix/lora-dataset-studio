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
})
