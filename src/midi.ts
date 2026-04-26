const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiNoteName(midi: number): string {
  const pc = NOTE_NAMES[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${pc}${octave}`
}

export type NoteEvent = { type: 'on' | 'off'; midi: number; velocity: number }
export type NoteHandler = (event: NoteEvent) => void

export async function startMidi(onNote: NoteHandler): Promise<void> {
  if (!navigator.requestMIDIAccess) {
    console.warn('[midi] Web MIDI API not available in this browser')
    return
  }

  let access: MIDIAccess
  try {
    access = await navigator.requestMIDIAccess()
  } catch (err) {
    console.warn('[midi] requestMIDIAccess rejected:', err)
    return
  }

  const attach = (input: MIDIInput) => {
    console.log(`[midi] attached input: ${input.name ?? input.id}`)
    input.onmidimessage = (e: MIDIMessageEvent) => {
      const d = e.data
      if (!d || d.length < 3) return
      const status = d[0] & 0xf0
      const midi = d[1]
      const velocity = d[2]
      // Note-on with velocity 0 is treated as note-off (running status convention).
      if (status === 0x90 && velocity > 0) {
        console.log(`[midi] note-on  ${midi} ${midiNoteName(midi)} vel=${velocity}`)
        onNote({ type: 'on', midi, velocity })
      } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        console.log(`[midi] note-off ${midi} ${midiNoteName(midi)}`)
        onNote({ type: 'off', midi, velocity })
      }
    }
  }

  access.inputs.forEach(attach)

  access.onstatechange = e => {
    const port = e.port
    if (port?.type === 'input' && port.state === 'connected' && typeof (port as MIDIInput).onmidimessage !== 'undefined') {
      attach(port as MIDIInput)
    }
  }

  if (access.inputs.size === 0) {
    console.warn('[midi] no MIDI inputs connected yet — connect a device')
  }
}
