import { describe, expect, it } from 'vitest'
import { floodFill } from '../shared/fill.ts'

function canvas(w: number, h: number) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255)
  const set = (x: number, y: number, v: number) => {
    const i = (y * w + x) * 4
    d[i] = d[i + 1] = d[i + 2] = v
  }
  const get = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return [d[i], d[i + 1], d[i + 2]]
  }
  return { d, set, get }
}

describe('floodFill', () => {
  it('fills inside a closed box but not outside', () => {
    const w = 20
    const { d, set, get } = canvas(w, w)
    for (let i = 5; i <= 14; i++) {
      set(i, 5, 0)
      set(i, 14, 0)
      set(5, i, 0)
      set(14, i, 0)
    }
    const n = floodFill(d, w, w, 10, 10, [255, 0, 0])
    expect(n).toBe(8 * 8)
    expect(get(10, 10)).toEqual([255, 0, 0])
    expect(get(2, 2)).toEqual([255, 255, 255])
    // 向外扩 1 像素盖住边线
    expect(get(5, 10)).toEqual([255, 0, 0])
    expect(get(4, 10)).toEqual([255, 255, 255])
  })

  it('does nothing when filling with the same color', () => {
    const { d } = canvas(4, 4)
    expect(floodFill(d, 4, 4, 1, 1, [255, 255, 255])).toBe(0)
  })
})
