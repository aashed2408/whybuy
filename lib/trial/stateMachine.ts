import type { ChatMessage, Product, Verdict } from '../ai/types'

/**
 * Discrete states of the trial.
 *
 *   intro -> opening (prosecution opening statement)
 *         -> user_1 (defense 1, user types)
 *         -> prosecution_1 (prosecution responds)
 *         -> user_2
 *         -> prosecution_2
 *         -> user_3
 *         -> prosecution_3 (prosecution closing)
 *         -> deliberation
 *         -> verdict
 *         -> released (proceed) | loss (abandon, with cooldown)
 */
export type Phase =
  | 'intro'
  | 'opening'
  | 'user_1'
  | 'prosecution_1'
  | 'user_2'
  | 'prosecution_2'
  | 'user_3'
  | 'prosecution_3'
  | 'deliberation'
  | 'verdict'
  | 'released'
  | 'loss'

export interface TrialState {
  phase: Phase
  product: Product
  transcript: ChatMessage[]
  /** Index of the user-typed message currently being composed (0..2). */
  round: number
  /** Latest streaming text from the AI (live transcript preview). */
  streaming: string
  verdict: Verdict | null
  /** True if the user has chosen to override the loss verdict. */
  overridden: boolean
}

export const TOTAL_ROUNDS = 3

export function createInitialState(product: Product): TrialState {
  return {
    phase: 'intro',
    product,
    transcript: [],
    round: 0,
    streaming: '',
    verdict: null,
    overridden: false,
  }
}

/**
 * Reduce state based on the next event. Pure function.
 */
export type TrialEvent =
  | { type: 'INTRO_DONE' }
  | { type: 'AI_STREAM'; text: string }
  | { type: 'AI_DONE'; text: string; speaker: 'prosecution' }
  | { type: 'AI_FAIL'; message: string }
  | { type: 'USER_SEND'; text: string }
  | { type: 'DELIBERATION_DONE'; verdict: Verdict }
  | { type: 'USER_PROCEEDS' }
  | { type: 'USER_OVERRIDES' }
  | { type: 'USER_ACCEPTS_LOSS' }
  | { type: 'CLOSE' }

export function reduce(state: TrialState, ev: TrialEvent): TrialState {
  switch (ev.type) {
    case 'INTRO_DONE':
      return { ...state, phase: 'opening' }

    case 'AI_STREAM':
      return { ...state, streaming: ev.text }

    case 'AI_DONE': {
      const message: ChatMessage = { role: 'prosecution', text: ev.text, ts: Date.now() }
      const transcript = [...state.transcript, message]
      const next = nextPhaseAfterProsecution(state.phase)
      return { ...state, transcript, phase: next, streaming: '' }
    }

    case 'AI_FAIL':
      // Treat as a generic continue so we don't get stuck.
      return { ...state, phase: nextPhaseAfterProsecution(state.phase), streaming: '' }

    case 'USER_SEND': {
      const message: ChatMessage = { role: 'defense', text: ev.text, ts: Date.now() }
      const transcript = [...state.transcript, message]
      const round = state.round + 1
      const next = nextPhaseAfterUser(state.phase)
      return { ...state, transcript, round, phase: next }
    }

    case 'DELIBERATION_DONE':
      return { ...state, phase: 'verdict', verdict: ev.verdict, streaming: '' }

    case 'USER_PROCEEDS':
      return { ...state, phase: 'released' }

    case 'USER_OVERRIDES':
      return { ...state, phase: 'loss', overridden: true }

    case 'USER_ACCEPTS_LOSS':
      return { ...state, phase: 'loss', overridden: false }

    case 'CLOSE':
      return state

    default:
      return state
  }
}

function nextPhaseAfterProsecution(phase: Phase): Phase {
  switch (phase) {
    case 'opening':
      return 'user_1'
    case 'prosecution_1':
      return 'user_2'
    case 'prosecution_2':
      return 'user_3'
    case 'prosecution_3':
      return 'deliberation'
    default:
      return phase
  }
}

function nextPhaseAfterUser(phase: Phase): Phase {
  switch (phase) {
    case 'user_1':
      return 'prosecution_1'
    case 'user_2':
      return 'prosecution_2'
    case 'user_3':
      return 'prosecution_3'
    default:
      return phase
  }
}

export function isUserTurn(phase: Phase): boolean {
  return phase === 'user_1' || phase === 'user_2' || phase === 'user_3'
}

export function isAiSpeaking(phase: Phase): boolean {
  return phase === 'opening' || phase === 'prosecution_1' || phase === 'prosecution_2' || phase === 'prosecution_3' || phase === 'deliberation'
}

export function roundLabel(phase: Phase): string {
  if (phase === 'opening') return 'Opening'
  if (phase === 'user_1' || phase === 'prosecution_1') return 'Round 1 of 3'
  if (phase === 'user_2' || phase === 'prosecution_2') return 'Round 2 of 3'
  if (phase === 'user_3' || phase === 'prosecution_3') return 'Round 3 of 3'
  if (phase === 'deliberation' || phase === 'verdict') return 'Verdict'
  return ''
}
