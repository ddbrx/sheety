// Reads MIDI from the Mac (or any host running this script) via CoreMIDI
// and broadcasts note-on/off events to all connected WebSocket clients.
// Also exposes POST /evaluate which forwards a played-vs-expected payload
// to the Claude API and returns a one-sentence judgment for the HUD.
//
// The simulator's WKWebView and the phone-companion WebView don't expose
// the Web MIDI API, so the page can't talk to MIDI hardware directly.
// This bridge gets the events into Node, then out to the page over a
// regular WebSocket. ANTHROPIC_API_KEY stays in the Node process — never
// shipped in the Vite bundle.

import http from 'http'
import easymidi from 'easymidi'
import { WebSocketServer } from 'ws'
import Anthropic from '@anthropic-ai/sdk'

const PORT = Number(process.env.MIDI_BRIDGE_PORT ?? 8765)
const HOST = '0.0.0.0' // listen on all interfaces so a phone on LAN can connect

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`

const httpServer = http.createServer(handleHttp)
const wss = new WebSocketServer({ server: httpServer })
httpServer.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http+ws://${HOST}:${PORT}`)
})

const clients = new Set()
wss.on('connection', ws => {
  clients.add(ws)
  console.log(`[bridge] client connected (${clients.size} total)`)
  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[bridge] client disconnected (${clients.size} total)`)
  })
  ws.on('error', err => console.warn('[bridge] ws error:', err.message))
})

function broadcast(message) {
  const payload = JSON.stringify(message)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

const attached = new Map() // name -> easymidi.Input

function attachInput(name) {
  if (attached.has(name)) return
  try {
    const input = new easymidi.Input(name)
    input.on('noteon', ({ note, velocity }) => {
      // Some controllers send note-on with velocity 0 instead of note-off.
      const evt = velocity === 0
        ? { type: 'off', midi: note, velocity: 0 }
        : { type: 'on', midi: note, velocity }
      console.log(`[bridge] ${evt.type === 'on' ? 'on ' : 'off'} ${note} ${noteName(note)}${evt.type === 'on' ? ` vel=${velocity}` : ''}`)
      broadcast(evt)
    })
    input.on('noteoff', ({ note, velocity }) => {
      console.log(`[bridge] off ${note} ${noteName(note)}`)
      broadcast({ type: 'off', midi: note, velocity })
    })
    attached.set(name, input)
    console.log(`[bridge] attached input: ${name}`)
  } catch (err) {
    console.warn(`[bridge] could not open ${name}:`, err.message)
  }
}

function syncInputs() {
  const present = new Set(easymidi.getInputs())
  for (const name of present) attachInput(name)
  for (const [name, input] of attached) {
    if (!present.has(name)) {
      try { input.close() } catch { /* ignore */ }
      attached.delete(name)
      console.log(`[bridge] detached input: ${name}`)
    }
  }
}

syncInputs()
// Re-scan periodically so devices plugged in after start-up are picked up.
setInterval(syncInputs, 2000)

const shutdown = () => {
  console.log('[bridge] shutting down')
  for (const input of attached.values()) {
    try { input.close() } catch { /* ignore */ }
  }
  wss.close()
  httpServer.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ── Claude evaluation ────────────────────────────────────────────────

const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY

// Short system prompt — well below Haiku 4.5's 4096-token cache minimum,
// so the cache_control marker won't fire today; kept for forward-compat
// if the prompt grows later.
const SYSTEM_PROMPT = `You are a concise piano teacher. The student attempted a passage on a digital piano; you receive what they were supposed to play and what they actually played (with timestamps).

Judge PLAYING QUALITY only — rhythm, timing, evenness, melodic contour relative to itself, hesitations, dropped or duplicated notes, chord accuracy. Do NOT comment on key, scale, or transposition. If the student played the piece transposed to a different key, treat that as fine and ignore it: compare the SHAPE of what they played (intervals between successive notes, beat positions) to the SHAPE of the expected sequence, not the absolute pitch class. Never tell them to "transpose up/down" or "play in X major" — assume the choice of key is intentional.

Reply with ONE short sentence (max 110 characters), specific (call out a beat or a pattern when useful), encouraging but direct. The output appears on a tiny smart-glasses HUD — no preamble, no markdown, no quotation marks, no trailing newline.`

function formatEvalPrompt({ mode, played, expected }) {
  const onNotes = (played ?? []).filter(p => p && p.type === 'on')
  const playedStr = onNotes.length === 0
    ? '(nothing)'
    : onNotes.map(p => `${noteName(p.midi)}@${p.t}ms`).join(' ')

  if (mode === 'exercises') {
    const exp = (expected ?? []).map(noteName).join(' ')
    return `Mode: Exercise — play these notes in order.
Expected: ${exp}
Played:   ${playedStr}`
  }
  if (mode === 'pieces') {
    const exp = (expected ?? [])
      .map(e => `${e.beat.toFixed(1)}b${e.staff[0].toUpperCase()}:${(e.midis ?? []).map(noteName).join('+')}`)
      .join(' ')
    return `Mode: Piece — "Mia & Sebastian's Theme" (first 4 bars, A major, 3/4 time).
Expected (beat·clef·notes): ${exp}
Played (note@time):         ${playedStr}`
  }
  return `Mode: ${mode}\nPayload: ${JSON.stringify({ played: onNotes, expected })}`
}

async function callClaude(payload) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in the environment')
  }
  const userMessage = formatEvalPrompt(payload)
  const response = await anthropic.messages.create({
    // Haiku 4.5: small, simple judgment task, latency-bound. Swap to
    // claude-opus-4-7 if you want richer feedback at higher latency.
    model: 'claude-haiku-4-5',
    max_tokens: 80, // ~110 chars worst case
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })
  for (const block of response.content) {
    if (block.type === 'text' && block.text) return block.text.trim()
  }
  return '(no text in response)'
}

function handleHttp(req, res) {
  // Permissive CORS — bridge is dev-only on localhost / LAN.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/evaluate') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}')
        console.log(`[bridge] /evaluate mode=${payload.mode} played=${payload.played?.length ?? 0}`)
        const text = await callClaude(payload)
        console.log(`[bridge] /evaluate -> ${text.slice(0, 80)}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ text }))
      } catch (err) {
        console.error('[bridge] /evaluate failed:', err.message)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end('not found')
}
