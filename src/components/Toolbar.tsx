import { COLORS, SIZES } from '../../shared/draw.ts'

export type Tool = 'pen' | 'eraser' | 'fill'

export interface ToolState {
  tool: Tool
  color: string
  size: number
}

interface Props {
  value: ToolState
  onChange: (f: (v: ToolState) => ToolState) => void
  onUndo: () => void
  onClear: () => void
  canUndo: boolean
}

const btn = 'flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ring-line'

export function Toolbar({ value, onChange, onUndo, onClear, canUndo }: Props) {
  const set = (p: Partial<ToolState> | ((v: ToolState) => Partial<ToolState>)) =>
    onChange((v) => ({ ...v, ...(typeof p === 'function' ? p(v) : p) }))
  const tools: [Tool, string, string][] = [
    ['pen', '✏️', '画笔'],
    ['fill', '🪣', '颜料桶'],
    ['eraser', '🧽', '橡皮'],
  ]
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 wide:flex-wrap wide:overflow-visible">
      <div className="flex shrink-0 gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => set((v) => ({ color: c, tool: v.tool === 'eraser' ? 'pen' : v.tool }))}
            className={`h-8 w-8 shrink-0 rounded-full wide:h-9 wide:w-9 ring-offset-2 ring-offset-paper ${
              value.color === c && value.tool !== 'eraser' ? 'ring-3 ring-ink' : 'ring-1 ring-black/10'
            }`}
            style={{ background: c }}
            aria-label={`颜色 ${c}`}
          />
        ))}
      </div>
      <div className="flex shrink-0 gap-1">
        {SIZES.map((s, i) => (
          <button
            key={s}
            onClick={() => set((v) => ({ size: i, tool: v.tool === 'fill' ? 'pen' : v.tool }))}
            className={`${btn} ${value.size === i && value.tool !== 'fill' ? 'bg-ink/10 ring-ink' : 'bg-panel'}`}
            aria-label={`粗细 ${i + 1}`}
          >
            <span className="rounded-full bg-ink" style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
          </button>
        ))}
      </div>
      <div className="flex shrink-0 gap-1">
        {tools.map(([t, icon, label]) => (
          <button
            key={t}
            onClick={() => set({ tool: t })}
            className={`${btn} ${value.tool === t ? 'bg-accent/15 ring-accent' : 'bg-panel'}`}
            title={label}
            aria-label={label}
          >
            {icon}
          </button>
        ))}
        <button onClick={onUndo} disabled={!canUndo} className={`${btn} bg-panel disabled:opacity-40`} title="撤销" aria-label="撤销">
          ↩️
        </button>
        <button onClick={onClear} disabled={!canUndo} className={`${btn} bg-panel disabled:opacity-40`} title="清空" aria-label="清空">
          🗑️
        </button>
      </div>
    </div>
  )
}
