/** 颜料桶填充用到的容差：和起点颜色每个通道相差不超过它都算同一块区域 */
export const FILL_TOLERANCE = 96

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 扫描线洪水填充，直接改 RGBA 像素数组。
 * 填完再向外扩 1 像素，盖住线条边缘的抗锯齿半透明像素，避免留下白边。
 * 返回填充的像素数。
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: [number, number, number],
  tolerance = FILL_TOLERANCE,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0
  const start = (y * width + x) * 4
  const tr = data[start]
  const tg = data[start + 1]
  const tb = data[start + 2]
  const [fr, fg, fb] = color
  if (tr === fr && tg === fg && tb === fb) return 0

  const match = (i: number) => {
    const p = i * 4
    return (
      Math.abs(data[p] - tr) <= tolerance &&
      Math.abs(data[p + 1] - tg) <= tolerance &&
      Math.abs(data[p + 2] - tb) <= tolerance
    )
  }

  const mask = new Uint8Array(width * height)
  const stack: number[] = [x, y]
  let filled = 0
  while (stack.length) {
    const sy = stack.pop()!
    let sx = stack.pop()!
    let i = sy * width + sx
    while (sx > 0 && !mask[i - 1] && match(i - 1)) {
      sx--
      i--
    }
    let up = false
    let down = false
    while (sx < width && !mask[i] && match(i)) {
      mask[i] = 1
      filled++
      if (sy > 0) {
        const u = i - width
        if (!mask[u] && match(u)) {
          if (!up) {
            stack.push(sx, sy - 1)
            up = true
          }
        } else up = false
      }
      if (sy < height - 1) {
        const d = i + width
        if (!mask[d] && match(d)) {
          if (!down) {
            stack.push(sx, sy + 1)
            down = true
          }
        } else down = false
      }
      sx++
      i++
    }
  }

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = py * width + px
      let hit = mask[i] === 1
      if (!hit) {
        hit =
          (px > 0 && mask[i - 1] === 1) ||
          (px < width - 1 && mask[i + 1] === 1) ||
          (py > 0 && mask[i - width] === 1) ||
          (py < height - 1 && mask[i + width] === 1)
      }
      if (hit) {
        const p = i * 4
        data[p] = fr
        data[p + 1] = fg
        data[p + 2] = fb
        data[p + 3] = 255
      }
    }
  }
  return filled
}
