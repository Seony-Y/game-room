import type { Role } from './types'

export const ROLE_INFO: Record<Role, { name: string; emoji: string; desc: string }> = {
  mafia: { name: '마피아', emoji: '🔪', desc: '정체를 숨기고 시민을 제거하세요. 미션도 잊지 마세요!' },
  doctor: { name: '의사', emoji: '💉', desc: '밤마다 한 명을 살릴 수 있습니다.' },
  police: { name: '경찰', emoji: '🚓', desc: '밤마다 한 명이 마피아인지 조사할 수 있습니다.' },
  citizen: { name: '시민', emoji: '🧑', desc: '토론으로 마피아를 찾아내세요.' },
}

export const TEAM_NAME = { mafia: '마피아', citizen: '시민' } as const

export const OUTCOME_TEXT = {
  citizen: '시민이 승리했습니다.',
  mafia: '마피아가 승리했습니다.',
  'mission-fail': '마피아가 미션을 성공하지 못해 시민이 승리하였습니다.',
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
export const PLAYER_KEY = 'player'
