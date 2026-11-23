import { useEffect, useRef } from 'react'
import { BG, H, MAX_POINTS_PER_MSG, SIZES, W, type DrawOp } from '../../shared/draw.ts'
import { unlockAudio } from '../lib/audio.ts'
import type { Board } from '../lib/board.ts'
import type { ToolState } from './Toolbar.tsx'

interface Props {
  board: Board | null
  enabled: boolean
  tool: ToolState
  /** 发送到服务器 */
  onOp: (op: DrawOp) => void
  /** 本地画完一步，用于刷新撤销按钮 */
  onLocal: () => void
}

const FLUSH_MS = 50
/** 每一笔的 id；只需要和上一笔不同 */
let strokeSeq = Math.floor(Math.random() * 1e6)
const MIN_STEP = 3

/** 盖在画布上的透明层，负责把手指/鼠标变成画画操作 */
export function DrawSurface({ board, enabled, tool, onOp, onLocal }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useRef<{ pointer: number; id: number; x: number; y: number; buf: number[] } | null>(null)
  const opRef = useRef(onOp)
  useEffect(() => {
    opRef.current = onOp
  })

  const flush = () => {
    const a = active.current
    if (!a || !a.buf.length) return
    for (let i = 0; i < a.buf.length; i += MAX_POINTS_PER_MSG) {
      opRef.current({ k: 'a', id: a.id, p: a.buf.slice(i, i + MAX_POINTS_PER_MSG) })
    }
    a.buf = []
  }

  useEffect(() => {
    const t = setInterval(flush, FLUSH_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!enabled) active.current = null
  }, [enabled])

  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * W)
    const y = Math.round(((e.clientY - r.top) / r.height) * H)
    return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))] as const
  }

  const local = (op: DrawOp) => {
    if (board?.apply(op)) onLocal()
  }

  const down = (e: React.PointerEvent) => {
    unlockAudio()
    if (!enabled || !board || active.current) return
    e.preventDefault()
    const [x, y] = toLogical(e)
    if (tool.tool === 'fill') {
      const op: DrawOp = { k: 'f', x: Math.min(W - 1, x), y: Math.min(H - 1, y), c: tool.color }
      local(op)
      opRef.current(op)
      return
    }
    ref.current!.setPointerCapture(e.pointerId)
    const id = strokeSeq++ % 1e9
    const eraser = tool.tool === 'eraser'
    const op: DrawOp = {
      k: 's',
      id,
      c: eraser ? BG : tool.color,
      w: eraser ? Math.round(SIZES[tool.size] * 2.5) : SIZES[tool.size],
      p: [x, y],
    }
    active.current = { pointer: e.pointerId, id, x, y, buf: [] }
    local(op)
    opRef.current(op)
  }

  const move = (e: React.PointerEvent) => {
    const a = active.current
    if (!a || a.pointer !== e.pointerId) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const pts: number[] = []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = toLogical(ev)
      if (Math.hypot(x - a.x, y - a.y) < MIN_STEP) continue
      a.x = x
      a.y = y
      pts.push(x, y)
    }
    if (!pts.length) return
    a.buf.push(...pts)
    board?.apply({ k: 'a', id: a.id, p: pts })
  }

  const up = (e: React.PointerEvent) => {
    const a = active.current
    if (!a || a.pointer !== e.pointerId) return
    flush()
    active.current = null
  }

  return (
    <div
      ref={ref}
      className={`absolute inset-0 ${enabled ? (tool.tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair') : ''}`}
      style={{ touchAction: 'none' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
