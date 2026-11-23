/**
 * 语音播放：全局只用一个 <audio>，在第一次触屏时用静音片段“解锁”，
 * 之后 iPad/iPhone 才允许不经点击自动播放。新语音排队依次播放。
 */
/** 0.05 秒静音 WAV */
function silentWav() {
  const samples = 400
  const buf = new DataView(new ArrayBuffer(44 + samples * 2))
  const str = (o: number, s: string) => [...s].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  buf.setUint32(4, 36 + samples * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  buf.setUint32(16, 16, true)
  buf.setUint16(20, 1, true)
  buf.setUint16(22, 1, true)
  buf.setUint32(24, 8000, true)
  buf.setUint32(28, 16000, true)
  buf.setUint16(32, 2, true)
  buf.setUint16(34, 16, true)
  str(36, 'data')
  buf.setUint32(40, samples * 2, true)
  return URL.createObjectURL(new Blob([buf.buffer], { type: 'audio/wav' }))
}

let el: HTMLAudioElement | null = null
let unlocked = false
const queue: string[] = []
let current: string | null = null
const listeners = new Set<() => void>()

function audio() {
  el ??= new Audio()
  return el
}

const notify = () => listeners.forEach((l) => l())

export function onPlayback(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const playingUrl = () => current

/** 在用户手势里调用一次 */
export function unlockAudio() {
  if (unlocked) return
  if (current) {
    unlocked = true
    return
  }
  const a = audio()
  a.src = silentWav()
  a.play().then(
    () => {
      unlocked = true
      if (!current) next()
    },
    () => {},
  )
}

function next() {
  const url = queue.shift()
  if (!url) {
    current = null
    notify()
    return
  }
  current = url
  notify()
  const a = audio()
  a.onended = () => next()
  a.onerror = () => next()
  a.src = url
  a.play().catch(() => {
    // 被浏览器拦截：清空队列，等用户手动点
    queue.length = 0
    current = null
    notify()
  })
}

/** 自动播放（排队） */
export function enqueueVoice(url: string) {
  queue.push(url)
  if (!current) next()
}

/** 手动点击播放：打断队列，立刻播放这条；再点一下停止 */
export function toggleVoice(url: string) {
  const a = audio()
  queue.length = 0
  if (current === url) {
    a.pause()
    current = null
    notify()
    return
  }
  queue.push(url)
  a.pause()
  next()
}
