// Minimal ambient declarations for the Web MIDI API.
// Avoids depending on @types/webmidi for a few used members.

interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array
}

interface MIDIInput extends EventTarget {
  readonly id: string
  readonly name?: string
  readonly manufacturer?: string
  readonly state: 'connected' | 'disconnected'
  readonly type: 'input'
  onmidimessage: ((this: MIDIInput, e: MIDIMessageEvent) => unknown) | null
}

interface MIDIInputMap {
  forEach(callback: (input: MIDIInput) => void): void
  size: number
}

interface MIDIConnectionEvent extends Event {
  readonly port: { type: string; state: string } & Partial<MIDIInput>
}

interface MIDIAccess extends EventTarget {
  readonly inputs: MIDIInputMap
  onstatechange: ((this: MIDIAccess, e: MIDIConnectionEvent) => unknown) | null
}

interface MIDIOptions {
  sysex?: boolean
  software?: boolean
}

interface Navigator {
  requestMIDIAccess?(options?: MIDIOptions): Promise<MIDIAccess>
}
