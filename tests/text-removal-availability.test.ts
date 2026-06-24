import { describe, expect, it } from 'vitest'
import { getTextRemovalPrepareBlockReason } from '../src/text-removal-availability'

describe('text removal availability', () => {
  it('blocks preparing with text removal in browser preview mode', () => {
    expect(getTextRemovalPrepareBlockReason({
      isDesktop: false,
      textRemovalEnabled: true,
      manualRegionCount: 1,
    })).toBe('网页模式只能预览框选区域；要运行 LaMA 去水印，请打开桌面应用。')
  })

  it('asks for at least one selected region before preparing', () => {
    expect(getTextRemovalPrepareBlockReason({
      isDesktop: true,
      textRemovalEnabled: true,
      manualRegionCount: 0,
    })).toBe('已开启去水印，请先在右侧大图上点击或拖拽框选要清理的文字或水印。')
  })

  it('allows ordinary preparation when text removal is off', () => {
    expect(getTextRemovalPrepareBlockReason({
      isDesktop: false,
      textRemovalEnabled: false,
      manualRegionCount: 0,
    })).toBeNull()
  })
})
