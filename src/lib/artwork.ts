import { exportPng, saveImage } from './board.ts'

export interface Artwork {
  turn: number
  word: string
  drawer: string
  url: string
}

export async function saveArtwork(a: Artwork) {
  const blob = await exportPng(a.url, `「${a.word}」 ${a.drawer} 画`)
  await saveImage(blob, `你画我猜-${a.word}-${a.drawer}.png`)
}

export const voiceUrl = (code: string, id: string) => `/api/rooms/${code}/voice/${id}`
