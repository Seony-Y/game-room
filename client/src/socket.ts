import { io } from 'socket.io-client'
import type { Ack } from './types'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export const socket = io(SERVER_URL, { autoConnect: true })

export function emit<T extends Ack = Ack>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: T) => {
      if (err) resolve({ ok: false, error: '서버 응답이 없습니다. 잠시 후 다시 시도해주세요.' } as T)
      else resolve(res)
    })
  })
}
