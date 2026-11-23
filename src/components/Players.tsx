import type { PlayerView } from '../../shared/game.ts'
import { Avatar } from './Avatar.tsx'

interface Props {
  view: PlayerView
  /** 画的人点猜词人：判定猜对 */
  onAward?: (id: string) => void
  /** 房主在大厅里请人离开 */
  onKick?: (id: string) => void
}

export function Players({ view, onAward, onKick }: Props) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score)
  const rank = new Map(ranked.map((p, i) => [p.id, i]))
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1 wide:flex-col wide:overflow-x-visible wide:pb-0">
      {view.players.map((p) => {
        const drawing = p.id === view.drawerId && (view.phase === 'choosing' || view.phase === 'drawing')
        const canAward = !!onAward && !drawing && !p.guessed
        const body = (
          <>
            <Avatar id={p.id} name={p.name} size={32} dim={!p.online} />
            <span className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-1 text-sm font-semibold">
                <span className="max-w-[6em] truncate">{p.name}</span>
                {p.id === view.meId && <span className="text-xs font-normal text-muted">(我)</span>}
                {p.id === view.hostId && <span title="房主">👑</span>}
              </span>
              <span className="block text-xs text-muted">
                {p.score} 分
                {p.gain > 0 && view.phase !== 'lobby' && <span className="ml-1 font-semibold text-good">+{p.gain}</span>}
                {view.phase !== 'lobby' && rank.get(p.id) === 0 && p.score > 0 && ' 🏆'}
              </span>
            </span>
            {drawing && <span title="正在画">✏️</span>}
            {p.guessed && <span className="pop text-good" title="猜对了">✔</span>}
            {canAward && <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good">判对</span>}
          </>
        )
        const cls = `flex min-w-36 shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 ring-1 wide:min-w-0 ${
          p.guessed ? 'bg-good/10 ring-good/40' : drawing ? 'bg-accent/10 ring-accent/40' : 'bg-panel ring-line'
        }`
        return (
          <li key={p.id} className="relative">
            {canAward ? (
              <button className={`${cls} w-full active:scale-95`} onClick={() => onAward(p.id)} title={`判定 ${p.name} 猜对了`}>
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
            {onKick && p.id !== view.meId && (
              <button
                onClick={() => confirm(`请 ${p.name} 离开房间？`) && onKick(p.id)}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-line text-xs text-muted"
                aria-label={`请 ${p.name} 离开`}
              >
                ×
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
