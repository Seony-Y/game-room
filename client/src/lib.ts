import type { Role } from './types'

export const ROLE_INFO: Record<Role, { name: string; emoji: string; desc: string }> = {
  mafia: { name: '마피아', emoji: '🔪', desc: '정체를 숨기고 미션을 완수하세요.' },
  doctor: { name: '의사', emoji: '💉', desc: '밤마다 한 명을 살릴 수 있어요.' },
  police: { name: '경찰', emoji: '🚓', desc: '밤마다 한 명을 조사할 수 있어요.' },
  citizen: { name: '시민', emoji: '🧑', desc: '토론으로 마피아를 찾아내세요.' },
}

export const TEAM_NAME = { mafia: '마피아', citizen: '시민' } as const

// 결과 문구 (모바일에서 의미 단위로 줄바꿈되도록 줄별로 나눔)
export const OUTCOME_LINES = {
  citizen: ['시민이 승리했습니다.'],
  mafia: ['마피아가 승리했습니다.'],
  'mission-fail': ['마피아가 미션을 성공하지 못해', '시민이 승리하였습니다.'],
} as const

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function storageSet(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 불가 환경 무시 */
  }
}

export const adminKey = (code: string) => `admin:${code}`

// 브라우저별 고유 ID (내보낸 사람 재입장 차단용)
let memoryDeviceId: string | null = null
export function getDeviceId() {
  let id = storageGet<string>('deviceId') ?? memoryDeviceId
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    storageSet('deviceId', id)
  }
  memoryDeviceId = id
  return id
}
export const PLAYER_KEY = 'player'
