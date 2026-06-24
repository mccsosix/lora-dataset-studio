import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreprocessStep } from '../src/components/PreprocessStep'

describe('PreprocessStep', () => {
  it('shows preparation progress and manual text removal controls', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="white-padding"
        totalCount={6}
        selectedCount={2}
        batchScope="selected"
        preparedCount={2}
        isPreparing={false}
        batchProgress={{
          phase: 'prepare',
          completed: 1,
          total: 2,
          fileName: 'sample.jpg',
        }}
        textRemovalEnabled={true}
        manualRegionCount={3}
        textRemovalStatus={{
          state: 'ready',
          adapterId: 'iopaint-lama',
          label: 'LaMA 修复可用',
          detail: '已找到 IOPaint',
        }}
        onModeChange={() => undefined}
        onBatchScopeChange={() => undefined}
        onTextRemovalChange={() => undefined}
        onAutoDetectTextRegions={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('2 / 6')
    expect(markup).toContain('Remove text / watermark')
    expect(markup).toContain('本次 3 个框')
    expect(markup).toContain('LaMA 修复可用')
    expect(markup).toContain('批量自动检测')
    expect(markup).toContain('处理范围')
    expect(markup).toContain('本次范围')
    expect(markup).toContain('仅已勾选 2 张')
    expect(markup).toContain('水印框')
    expect(markup).toContain('准备 2 张图片')
    expect(markup).toContain('正在准备图片')
    expect(markup).toContain('1 / 2')
    expect(markup).toContain('sample.jpg')
  })

  it('keeps a visible completion message after text removal preparation finishes', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="preserve-aspect"
        totalCount={6}
        selectedCount={2}
        batchScope="selected"
        preparedCount={4}
        isPreparing={false}
        completionMessage="去水印完成：2 张图片 · 3 个区域已处理。"
        completionItems={[
          { imageId: 'one', name: 'one.jpg', status: 'cleaned', detail: '2 个区域 · LaMA' },
          { imageId: 'two', name: 'two.jpg', status: 'skipped', detail: '未框选区域' },
        ]}
        textRemovalEnabled={true}
        manualRegionCount={3}
        onModeChange={() => undefined}
        onBatchScopeChange={() => undefined}
        onTextRemovalChange={() => undefined}
        onAutoDetectTextRegions={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('去水印完成：2 张图片 · 3 个区域已处理。')
    expect(markup).toContain('preprocess-completion')
    expect(markup).toContain('one.jpg')
    expect(markup).toContain('2 个区域 · LaMA')
    expect(markup).toContain('two.jpg')
    expect(markup).toContain('未框选区域')
  })

  it('summarizes the pending text-removal checklist before preparation starts', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="preserve-aspect"
        totalCount={3}
        selectedCount={2}
        batchScope="selected"
        preparedCount={0}
        isPreparing={false}
        textRemovalEnabled={true}
        manualRegionCount={2}
        pendingItems={[
          { imageId: 'one', name: 'one.jpg', status: 'will-clean', detail: '2 个区域待处理' },
          { imageId: 'three', name: 'three.jpg', status: 'will-clean', detail: '1 个区域待处理' },
          { imageId: 'two', name: 'two.jpg', status: 'skipped', detail: '未框选区域' },
        ]}
        onModeChange={() => undefined}
        onBatchScopeChange={() => undefined}
        onTextRemovalChange={() => undefined}
        onAutoDetectTextRegions={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('准备前检查')
    expect(markup).toContain('2 张待去水印')
    expect(markup).toContain('1 张无框跳过')
    expect(markup).toContain('<details')
    expect(markup).toContain('<summary')
    expect(markup).toContain('one.jpg')
    expect(markup).toContain('2 个区域待处理')
    expect(markup).toContain('two.jpg')
    expect(markup).toContain('未框选区域')
  })

  it('shows batch text-region editing tools when text removal is enabled', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="preserve-aspect"
        totalCount={12}
        selectedCount={4}
        batchScope="selected"
        preparedCount={0}
        isPreparing={false}
        textRemovalEnabled={true}
        manualRegionCount={7}
        autoRegionCount={5}
        activeRegionCount={2}
        onModeChange={() => undefined}
        onBatchScopeChange={() => undefined}
        onTextRemovalChange={() => undefined}
        onAutoDetectTextRegions={() => undefined}
        onClearAutoTextRegions={() => undefined}
        onApplyActiveTextRegionsToBatch={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('批量框选')
    expect(markup).toContain('自动 5 个')
    expect(markup).toContain('当前图 2 个')
    expect(markup).toContain('清空自动检测框')
    expect(markup).toContain('套用当前图区域')
  })

  it('shows text-removal setup recovery when LaMA is unavailable', () => {
    const markup = renderToStaticMarkup(
      <PreprocessStep
        mode="preserve-aspect"
        totalCount={1}
        selectedCount={1}
        batchScope="selected"
        preparedCount={0}
        isPreparing={false}
        textRemovalEnabled={true}
        manualRegionCount={0}
        textRemovalStatus={{
          state: 'fallback',
          adapterId: 'local-sharp-inpaint',
          label: 'LaMA 未就绪',
          detail: '没有找到 iopaint，可按 docs/text-removal-iopaint-setup.md 安装。',
        }}
        onModeChange={() => undefined}
        onBatchScopeChange={() => undefined}
        onTextRemovalChange={() => undefined}
        onAutoDetectTextRegions={() => undefined}
        onRefreshTextRemovalStatus={() => undefined}
        onPrepare={() => undefined}
      />,
    )

    expect(markup).toContain('LaMA 未就绪')
    expect(markup).toContain('没有找到 iopaint')
    expect(markup).toContain('重新检查')
  })
})
