import { BG, H, reduceOps, W, type DrawOp, type StoredOp } from '../../shared/draw.ts'
import { floodFill, hexToRgb } from '../../shared/fill.ts'

/**
 * 画布渲染：canvas 内部固定为逻辑尺寸 W×H，CSS 负责缩放。
 * 操作列表和服务器同一套 reduceOps 规则；撤销时整体重放。
 */
export class Board {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  ops: StoredOp[] = []
  turn = -1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    canvas.width = W
    canvas.height = H
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!
    this.clear()
  }

  load(turn: number, ops: StoredOp[]) {
    this.turn = turn
    this.ops = structuredClone(ops)
    this.redraw()
  }

  /** 换题：清空 */
  reset(turn: number) {
    if (this.turn === turn) return
    this.load(turn, [])
  }

  apply(op: DrawOp) {
    const last = this.ops.at(-1)
    const prevLen = op.k === 'a' && last?.k === 's' ? last.p.length : 0
    if (!reduceOps(this.ops, op)) return false
    switch (op.k) {
      case 's':
        this.stroke(this.ops.at(-1) as Extract<StoredOp, { k: 's' }>, 0)
        break
      case 'a':
        this.stroke(this.ops.at(-1) as Extract<StoredOp, { k: 's' }>, Math.max(0, prevLen - 2))
        break
      case 'f':
        this.fill(op)
        break
      case 'x':
        this.clear()
        break
      case 'u':
        this.redraw()
        break
    }
    return true
  }

  redraw() {
    this.clear()
    for (const op of this.ops) {
      if (op.k === 's') this.stroke(op, 0)
      else if (op.k === 'f') this.fill(op)
      else this.clear()
    }
  }

  private clear() {
    this.ctx.fillStyle = BG
    this.ctx.fillRect(0, 0, W, H)
  }

  /** 从点列的第 from 个数开始画（from 为偶数，指向一个点的 x） */
  private stroke(op: Extract<StoredOp, { k: 's' }>, from: number) {
    const c = this.ctx
    const p = op.p
    c.strokeStyle = op.c
    c.fillStyle = op.c
    c.lineWidth = op.w
    c.lineCap = 'round'
    c.lineJoin = 'round'
    if (p.length === 2 && from === 0) {
      c.beginPath()
      c.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2)
      c.fill()
      return
    }
    c.beginPath()
    c.moveTo(p[from], p[from + 1])
    for (let i = from + 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1])
    c.stroke()
  }

  private fill(op: Extract<StoredOp, { k: 'f' }>) {
    const img = this.ctx.getImageData(0, 0, W, H)
    floodFill(img.data, W, H, op.x, op.y, hexToRgb(op.c))
    this.ctx.putImageData(img, 0, 0)
  }
}

/** 导出带题目和作者的 PNG */
export function exportPng(src: HTMLCanvasElement | string, caption: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const draw = (img: CanvasImageSource) => {
      const band = 90
      const out = document.createElement('canvas')
      out.width = W
      out.height = H + band
      const c = out.getContext('2d')!
      c.fillStyle = '#ffffff'
      c.fillRect(0, 0, out.width, out.height)
      c.drawImage(img, 0, 0, W, H)
      c.fillStyle = '#f4f1ea'
      c.fillRect(0, H, W, band)
      c.fillStyle = '#24211d'
      c.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif'
      c.textBaseline = 'middle'
      c.fillText(caption, 32, H + band / 2)
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png')
    }
    if (typeof src !== 'string') return draw(src)
    const img = new Image()
    img.onload = () => draw(img)
    img.onerror = () => reject(new Error('导出失败'))
    img.src = src
  })
}

/** 能分享就分享（手机/平板可以存到相册），否则直接下载 */
export async function saveImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
