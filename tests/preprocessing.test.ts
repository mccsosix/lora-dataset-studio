import { describe, expect, it } from 'vitest'
import { countPreparedImages } from '../src/preprocessing'

describe('countPreparedImages', () => {
  it('counts missing preparation records as zero instead of NaN', () => {
    expect(countPreparedImages([
      {},
      { preparation: undefined },
      { preparation: { mode: 'preserve-aspect' } },
    ])).toBe(1)
  })
})
