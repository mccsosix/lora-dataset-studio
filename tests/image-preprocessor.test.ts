import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  preprocessImage,
} from '../electron/services/image-preprocessor'
import { calculateOutputGeometry } from '../src/preprocessing'

describe('calculateOutputGeometry', () => {
  it('creates aligned SDXL bucket dimensions while preserving aspect ratio', () => {
    expect(calculateOutputGeometry(1600, 900, { mode: 'preserve-aspect' })).toEqual({
      width: 1344,
      height: 768,
    })
    expect(calculateOutputGeometry(900, 1600, { mode: 'preserve-aspect' })).toEqual({
      width: 768,
      height: 1344,
    })
    expect(calculateOutputGeometry(512, 512, { mode: 'preserve-aspect' })).toEqual({
      width: 512,
      height: 512,
    })
    expect(calculateOutputGeometry(4000, 500, { mode: 'preserve-aspect' })).toEqual({
      width: 2048,
      height: 256,
    })
  })

  it('creates exact square output for padding and crop modes', () => {
    expect(calculateOutputGeometry(1600, 900, { mode: 'white-padding' })).toEqual({
      width: 1024,
      height: 1024,
    })
    expect(calculateOutputGeometry(900, 1600, { mode: 'center-crop' })).toEqual({
      width: 1024,
      height: 1024,
    })
  })
})

describe('preprocessImage', () => {
  it('writes a same-base-name JPEG without changing the source image', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-preprocess-'))
    const sourcePath = join(root, 'sample.png')
    const outputDirectory = join(root, 'processed')
    await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 0.5 },
      },
    }).png().toFile(sourcePath)
    const sourceBefore = await readFile(sourcePath)

    const result = await preprocessImage({
      imageId: 'image-1',
      sourcePath,
      outputDirectory,
      settings: { mode: 'white-padding' },
    })
    const outputMetadata = await sharp(result.outputPath).metadata()

    expect(await readFile(sourcePath)).toEqual(sourceBefore)
    expect(result.outputFilename).toBe('sample.jpg')
    expect(result.originalDimensions).toEqual({ width: 1200, height: 800 })
    expect(result.outputDimensions).toEqual({ width: 1024, height: 1024 })
    expect(outputMetadata).toMatchObject({ format: 'jpeg', width: 1024, height: 1024 })
  })
})
