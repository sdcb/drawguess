const HUES = ['#f0632b', '#1e88e5', '#43a047', '#8e24aa', '#f06292', '#00acc1', '#fb8c00', '#6d4c41', '#3949ab', '#c0ca33']

function hue(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

export function Avatar({ id, name, size = 36, dim = false }: { id: string; name: string; size?: number; dim?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, background: hue(id), opacity: dim ? 0.4 : 1 }}
      aria-hidden
    >
      {[...name][0] ?? '?'}
    </span>
  )
}
