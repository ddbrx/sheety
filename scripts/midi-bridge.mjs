// Reads MIDI from the Mac (or any host running this script) via CoreMIDI
// and broadcasts note-on/off events to all connected WebSocket clients.
//
// The simulator's WKWebView and the phone-companion WebView don't expose
// the Web MIDI API, so the page can't talk to MIDI hardware directly.
// This bridge gets the events into Node, then out to the page over a
// regular WebSocket.

import easymidi from 'easymidi'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.MIDI_BRIDGE_PORT ?? 8765)
const HOST = '0.0.0.0' // listen on all interfaces so a phone on LAN can connect

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`

const wss = new WebSocketServer({ host: HOST, port: PORT })
console.log(`[bridge] listening on ws://${HOST}:${PORT}`)

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
  wss.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
