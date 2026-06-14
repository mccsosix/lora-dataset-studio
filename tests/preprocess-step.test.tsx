import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreprocessStep } from '../src/components/PreprocessStep'

describe('PreprocessStep', () => {
  it('explains the selected mode risk and shows preparation progress', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="white-padding"
        totalCount={6}
        preparedCount={2}
        isPreparing={false}
        onModeChange={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('白边可能会被 LoRA 学进去')
    expect(markup).toContain('已准备 2 / 6')
    expect(markup).toContain('准备 6 张图片')
  })
})
