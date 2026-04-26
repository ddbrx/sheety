// MIDI input over WebSocket. The simulator's WKWebView and the phone
// companion-app WebView don't expose Web MIDI, so we read from a Node-side
// bridge (scripts/midi-bridge.mjs) over a plain WebSocket instead.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiNoteName(midi: number): string {
  const pc = NOTE_NAMES[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${pc}${octave}`
}

export type NoteEvent = { type: 'on' | 'off'; midi: number; velocity: number }
export type NoteHandler = (event: NoteEvent) => void

const BRIDGE_PORT = 8765

export async function startMidi(onNote: NoteHandler): Promise<void> {
  const host = location.hostname || 'localhost'
  const url = `ws://${host}:${BRIDGE_PORT}`
  let backoffMs = 500

  const connect = (): void => {
    console.log(`[midi] connecting ${url}`)
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      console.warn('[midi] WebSocket constructor threw:', err)
      setTimeout(connect, backoffMs)
      backoffMs = Math.min(backoffMs * 2, 5000)
      return
    }

    ws.onopen = () => {
      console.log('[midi] connected to bridge')
      backoffMs = 500
    }

    ws.onmessage = e => {
      try {
        const raw = typeof e.data === 'string' ? e.data : ''
        const msg = JSON.parse(raw)
        if (
          msg &&
          (msg.type === 'on' || msg.type === 'off') &&
          typeof msg.midi === 'number'
        ) {
          console.log(`[midi] ${msg.type} ${msg.midi} ${midiNoteName(msg.midi)}`)
          onNote(msg as NoteEvent)
        }
      } catch (err) {
        console.warn('[midi] bad message:', err)
      }
    }

    ws.onclose = () => {
      console.warn(`[midi] disconnected, retrying in ${backoffMs}ms`)
      setTimeout(connect, backoffMs)
      backoffMs = Math.min(backoffMs * 2, 5000)
    }

    ws.onerror = () => {
      // onclose fires next; nothing to do here beyond avoiding a noisy log.
    }
  }

  connect()
}
