import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { detectTextRegionsInImage } from '../electron/services/text-region-detector'

describe('detectTextRegionsInImage', () => {
  it('suggests a normalized region around high-contrast corner watermark marks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-region-detect-'))
    const sourcePath = join(root, 'watermark.png')
    try {
      await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: '#eeeeee',
        },
      })
        .composite([
          {
            input: Buffer.from('<svg width="120" height="70"><text x="8" y="40" font-size="36" font-family="Arial" fill="#222">fdzz!</text></svg>'),
            left: 20,
            top: 18,
          },
        ])
        .png()
        .toFile(sourcePath)

      const regions = await detectTextRegionsInImage({ imageId: 'image-1', sourcePath })

      expect(regions.length).toBeGreaterThanOrEqual(1)
      expect(regions[0].id).toContain('image-1-auto')
      expect(regions[0].confidence).toBeGreaterThan(0.5)
      expect(regions[0].box?.x).toBeLessThan(0.2)
      expect(regions[0].box?.y).toBeLessThan(0.2)
      expect(regions[0].box?.width).toBeGreaterThan(0.1)
      expect(regions[0].box?.height).toBeGreaterThan(0.08)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not suggest large mid-image body contours as watermark regions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-region-false-positive-'))
    const sourcePath = join(root, 'body-contours.png')
    try {
      await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: '#efc0a2',
        },
      })
        .composite([
          {
            input: Buffer.from('<svg width="120" height="70"><text x="8" y="40" font-size="36" font-family="Arial" fill="#222">fdzz!</text></svg>'),
            left: 20,
            top: 18,
          },
          {
            input: Buffer.from('<svg width="90" height="140"><path d="M30 5 C 65 50, 45 95, 70 135" stroke="#7d4c38" stroke-width="10" fill="none"/></svg>'),
            left: 92,
            top: 110,
          },
        ])
        .png()
        .toFile(sourcePath)

      const regions = await detectTextRegionsInImage({ imageId: 'image-1', sourcePath })

      expect(regions.some((region) => (region.box?.y ?? 0) < 0.25)).toBe(true)
      expect(regions.some((region) => {
        const box = region.box
        if (!box) return false
        const centerY = box.y + box.height / 2
        return centerY > 0.35 && centerY < 0.8 && box.height > 0.18
      })).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps corner watermark suggestions while ignoring large top subject features', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-region-head-'))
    const sourcePath = join(root, 'head-false-positive.png')
    try {
      await sharp({
        create: {
          width: 400,
          height: 560,
          channels: 3,
          background: '#f6f2ea',
        },
      })
        .composite([
          {
            input: Buffer.from('<svg width="90" height="80"><text x="8" y="50" font-size="34" font-family="Arial" fill="#444" transform="rotate(-25 45 40)">fdzz!</text></svg>'),
            left: 10,
            top: 16,
          },
          {
            input: Buffer.from('<svg width="210" height="145"><ellipse cx="105" cy="72" rx="92" ry="56" fill="#dfb190"/><path d="M35 30 C 80 5, 145 10, 185 42" stroke="#1f2f55" stroke-width="18" fill="none"/><path d="M70 88 C 105 110, 140 98, 160 74" stroke="#7c4c3c" stroke-width="10" fill="none"/></svg>'),
            left: 120,
            top: 12,
          },
        ])
        .png()
        .toFile(sourcePath)

      const regions = await detectTextRegionsInImage({ imageId: 'image-1', sourcePath })

      expect(regions.some((region) => (region.box?.x ?? 1) < 0.12 && (region.box?.y ?? 1) < 0.12)).toBe(true)
      expect(regions.some((region) => {
        const box = region.box
        if (!box) return false
        return box.y < 0.28 && box.x > 0.2 && box.width > 0.25 && box.height > 0.12
      })).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('ignores large bottom subject features instead of treating them as watermarks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-region-bottom-'))
    const sourcePath = join(root, 'bottom-false-positive.png')
    try {
      await sharp({
        create: {
          width: 400,
          height: 560,
          channels: 3,
          background: '#263248',
        },
      })
        .composite([
          {
            input: Buffer.from('<svg width="110" height="72"><rect width="110" height="72" fill="#efefef"/><text x="8" y="44" font-size="34" font-family="Arial" fill="#333">@fdzz!</text></svg>'),
            left: 18,
            top: 18,
          },
          {
            input: Buffer.from('<svg width="290" height="145"><ellipse cx="145" cy="75" rx="135" ry="60" fill="#f2c09f"/><path d="M60 20 C 120 68, 100 115, 170 132" stroke="#8c543e" stroke-width="12" fill="none"/></svg>'),
            left: 55,
            top: 400,
          },
        ])
        .png()
        .toFile(sourcePath)

      const regions = await detectTextRegionsInImage({ imageId: 'image-1', sourcePath })

      expect(regions.some((region) => {
        const box = region.box
        if (!box) return false
        return box.y > 0.65 && box.width > 0.25 && box.height > 0.12
      })).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('detects a top-right corner watermark without boxing top-left subject detail', async () => {
    const regions = await detectTextRegionsInImage({
      imageId: 'top-right-real',
      sourcePath: 'C:/Users/Moc/Pictures/fdzz/HGw9ho9bgAEOW70.jpg',
    })

    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x > 0.7 && box.y < 0.18 && box.width > 0.1 && box.height > 0.08
    })).toBe(true)
    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x < 0.3 && box.y < 0.25
    })).toBe(false)
  })

  it('detects a bottom-right corner watermark without boxing upper subject detail', async () => {
    const regions = await detectTextRegionsInImage({
      imageId: 'bottom-right-real',
      sourcePath: 'C:/Users/Moc/Pictures/fdzz/HLI4ZOeWEAA4Ujh.jpg',
    })

    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x > 0.72 && box.y > 0.72 && box.width > 0.12 && box.height > 0.1
    })).toBe(true)
    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.y < 0.25 && box.width > 0.18
    })).toBe(false)
  })

  it('detects the top-left watermark without boxing the face on portrait samples', async () => {
    const regions = await detectTextRegionsInImage({
      imageId: 'portrait-watermark',
      sourcePath: 'C:/Users/Moc/Pictures/fdzz/02-pictechcc-watermarked.png',
    })

    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x < 0.2 && box.y < 0.18 && box.width > 0.08 && box.height > 0.06
    })).toBe(true)
    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x > 0.18 && box.y < 0.28 && box.width > 0.18 && box.height > 0.12
    })).toBe(false)
    expect(regions.filter((region) => {
      const box = region.box
      if (!box) return false
      return box.x < 0.34 && box.y < 0.3
    })).toHaveLength(1)
  })

  it('detects the top-left watermark without boxing large body highlights on camera-frame samples', async () => {
    const regions = await detectTextRegionsInImage({
      imageId: 'camera-frame-watermark',
      sourcePath: 'C:/Users/Moc/Pictures/fdzz/2 (3).png',
    })

    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      return box.x < 0.24 && box.y < 0.18 && box.width > 0.08 && box.height > 0.06
    })).toBe(true)
    expect(regions.some((region) => {
      const box = region.box
      if (!box) return false
      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2
      return centerX > 0.16 && centerX < 0.84 && centerY > 0.22 && box.height > 0.12
    })).toBe(false)
  })

  it('ignores camera overlay chrome when there is no watermark text', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-region-camera-ui-'))
    const sourcePath = join(root, 'camera-ui.png')
    try {
      await sharp({
        create: {
          width: 520,
          height: 720,
          channels: 3,
          background: '#2f415c',
        },
      })
        .composite([
          {
            input: Buffer.from(`
              <svg width="520" height="720" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 18 H125 M18 18 V160 M395 18 H502 M502 18 V160 M18 560 V702 M18 702 H125 M502 560 V702 M395 702 H502" stroke="#fff" stroke-width="5" fill="none"/>
                <circle cx="58" cy="64" r="13" fill="#f22"/>
                <rect x="438" y="46" width="46" height="22" stroke="#fff" stroke-width="4" fill="none"/>
                <rect x="484" y="53" width="8" height="8" fill="#fff"/>
                <rect x="42" y="640" width="46" height="18" stroke="#fff" stroke-width="4" fill="none"/>
                <path d="M52 642 L62 656 M68 642 L78 656" stroke="#fff" stroke-width="4"/>
              </svg>
            `),
            left: 0,
            top: 0,
          },
        ])
        .png()
        .toFile(sourcePath)

      const regions = await detectTextRegionsInImage({ imageId: 'camera-ui', sourcePath })

      expect(regions).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
