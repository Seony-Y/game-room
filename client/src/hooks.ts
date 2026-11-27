import { useEffect, useState, useSyncExternalStore } from 'react'
import { socket } from './socket'

function subscribeConnection(onChange: () => void) {
  socket.on('connect', onChange)
  socket.on('disconnect', onChange)
  return () => {
    socket.off('connect', onChange)
    socket.off('disconnect', onChange)
  }
}

export function useConnected() {
  return useSyncExternalStore(subscribeConnection, () => socket.connected)
}

// 2.2초 뒤 자동으로 사라지는 토스트 메시지
export function useToast() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2200)
    return () => clearTimeout(t)
  }, [msg])
  return [msg, setMsg] as const
}
