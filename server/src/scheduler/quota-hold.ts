// Ported from hermes-agent cron/quota_hold.py @ 54bc5e50 (MIT, Nous Research)
export interface QuotaState { heldUntil: number | null; reason: string | null }

export function holdUntil(state: QuotaState, resetsAtMs: number, reason: string): QuotaState {
  if (!Number.isFinite(resetsAtMs)) throw new RangeError('Quota reset time must be a finite timestamp in milliseconds.')
  // A second exhausted provider must not shorten an existing hold.
  return state.heldUntil !== null && state.heldUntil > resetsAtMs
    ? { ...state }
    : { heldUntil: resetsAtMs, reason }
}

export function isHeld(state: QuotaState, nowMs: number): boolean {
  return state.heldUntil !== null && state.heldUntil > nowMs
}

export function release(_state: QuotaState): QuotaState {
  return { heldUntil: null, reason: null }
}
