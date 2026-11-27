import type { GameType } from './types'

export interface SettingsValues {
  gameType: GameType
  capacity: number
  mafia: number
  doctor: number
  police: number
  missions: string[]
  question: string
}

export const DEFAULT_SETTINGS: SettingsValues = {
  gameType: 'mafia',
  capacity: 8,
  mafia: 2,
  doctor: 1,
  police: 1,
  missions: ['', ''],
  question: '',
}
