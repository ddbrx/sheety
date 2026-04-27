// Posts a played-vs-expected snapshot to the Node bridge's /evaluate
// endpoint. The bridge forwards to the Claude API server-side so the
// API key never enters the client bundle.

import type { PieceEvent } from './pieces'

export type PlayedEvent = { midi: number; type: 'on' | 'off'; t: number }

export type EvalRequest =
  | { mode: 'exercises'; played: PlayedEvent[]; expected: number[] }
  | { mode: 'pieces'; played: PlayedEvent[]; expected: PieceEvent[] }

const BRIDGE_PORT = 8765

export async function evaluatePerformance(req: EvalRequest): Promise<string> {
  const host = location.hostname || 'localhost'
  const url = `http://${host}:${BRIDGE_PORT}/evaluate`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!response.ok) {
    let msg = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.error === 'string') msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const data = await response.json()
  if (typeof data.text !== 'string') throw new Error('bridge returned no text')
  return data.text
}
