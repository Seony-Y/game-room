export type GameType = 'mafia' | 'image'
export type Role = 'mafia' | 'doctor' | 'police' | 'citizen'
export type Status = 'lobby' | 'playing'

export interface MafiaSettings {
  mafia: number
  doctor: number
  police: number
  missions: string[]
}

export interface ImageSettings {
  question: string
}

export interface RankEntry {
  id: string
  name: string
  votes: number
  rank: number
}

export type OutcomeType = 'citizen' | 'mafia' | 'mission-fail'

export interface MafiaOutcome {
  type: OutcomeType | null
  winner: 'mafia' | 'citizen' | null
  aliveMafia: number
  aliveOthers: number
  missionsDone: number
  missionsTotal: number
}

export interface Reveal {
  name: string
  role: Role
  alive: boolean
  mission?: string
  missionSuccess?: boolean
}

export interface AdminPlayer {
  id: string
  name: string
  connected: boolean
  role: Role | null
  mission: string | null
  alive: boolean
  missionSuccess: boolean
  votedFor: string | null
}

export interface AdminState {
  code: string
  gameType: GameType
  capacity: number
  settings: MafiaSettings | ImageSettings
  status: Status
  players: AdminPlayer[]
  mafia: { outcome: MafiaOutcome; resultShared: boolean } | null
  image: {
    round: number
    question: string
    votedCount: number
    revealed: boolean
    results: RankEntry[]
  } | null
}

export interface PlayerState {
  code: string
  gameType: GameType
  capacity: number
  status: Status
  me: { id: string; name: string }
  players: { id: string; name: string; connected: boolean; alive: boolean }[]
  role?: Role
  alive?: boolean
  mission?: string
  missionSuccess?: boolean
  mafiaTeam?: string[]
  result?: {
    type: OutcomeType
    winner: 'mafia' | 'citizen'
    reveals: Reveal[]
  }
  image?: {
    round: number
    question: string
    myVote: string | null
    votedCount: number
    revealed: boolean
    ranking: RankEntry[] | null
  }
}

export type Ack = { ok: true; [key: string]: unknown } | { ok: false; error: string }
