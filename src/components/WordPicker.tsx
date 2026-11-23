import { useState } from 'react'
import { WORD_MAX, type PlayerView } from '../../shared/game.ts'

interface Props {
  view: PlayerView
  remaining: number
  onPick: (index: number) => void
  onCustom: (word: string) => void
}

export function WordPicker({ view, remaining, onPick, onCustom }: Props) {
  const [custom, setCustom] = useState('')
  const [typing, setTyping] = useState(false)
  return (
    <div className="pop w-full max-w-md space-y-3 rounded-2xl bg-panel p-4 shadow-xl ring-1 ring-line">
      <p className="text-center font-semibold">
        轮到你画啦！选一个词 <span className="text-muted">（{remaining}s）</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {view.options.map((w, i) => (
          <button
            key={w.text}
            onClick={() => onPick(i)}
            className="rounded-xl bg-accent/10 px-2 py-3 ring-1 ring-accent/40 active:scale-95"
          >
            <span className="block text-lg font-bold">{w.text}</span>
            <span className="text-xs text-muted">{w.cat}</span>
          </button>
        ))}
      </div>
      {typing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) onCustom(custom.trim())
          }}
        >
          <input
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 text-base outline-none focus:border-accent"
            value={custom}
            maxLength={WORD_MAX}
            placeholder="自己想一个词"
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="h-11 rounded-xl bg-accent px-4 font-semibold text-white disabled:opacity-50" disabled={!custom.trim()}>
            就画它
          </button>
        </form>
      ) : (
        <button onClick={() => setTyping(true)} className="w-full rounded-xl py-2 text-sm text-accent ring-1 ring-line">
          ✍️ 我自己出题
        </button>
      )}
    </div>
  )
}
