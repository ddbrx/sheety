// Transcribed sheet-music data for the Pieces mode. Each piece is a list of
// note events at beat-precise time positions; the renderer lays them out
// horizontally across the staff by beat.

export type PieceEvent = {
  /** Beat offset from the start of the piece (0-indexed; 0.5 = an eighth). */
  beat: number
  /** MIDI numbers played simultaneously at this beat (chords/polyphony). */
  midis: number[]
  /** Which staff the event sits on. */
  staff: 'treble' | 'bass'
}

export type Piece = {
  name: string
  composer: string
  beatsPerMeasure: number
  /** Total beats currently encoded — used to pace the horizontal layout. */
  totalBeats: number
  events: PieceEvent[]
}

// Mia & Sebastian's Theme — Justin Hurwitz, La La Land.
// Key: A major (3 sharps). Time: 3/4. First four measures only.
// Transcription is a best-read of the score image; black-key MIDI numbers
// reflect the key signature (e.g. C# = 73, F# = 66, G# = 68) even though
// the on-screen sharps will look noisy without real key-signature support.
export const MIA_SEBASTIAN: Piece = {
  name: "Mia & Sebastian's Theme",
  composer: 'Justin Hurwitz',
  beatsPerMeasure: 3,
  totalBeats: 12,
  events: [
    // Measure 1 — RH: E4 A4 B4 C#5 B4 A4 (six eighth notes)
    { beat: 0.0, midis: [64], staff: 'treble' }, // E4
    { beat: 0.5, midis: [69], staff: 'treble' }, // A4
    { beat: 1.0, midis: [71], staff: 'treble' }, // B4
    { beat: 1.5, midis: [73], staff: 'treble' }, // C#5
    { beat: 2.0, midis: [71], staff: 'treble' }, // B4
    { beat: 2.5, midis: [69], staff: 'treble' }, // A4
    // Measure 2 — RH: A4 dotted half (3 beats)
    { beat: 3.0, midis: [69], staff: 'treble' },
    // Measure 3 — RH: same melodic cell as M1
    { beat: 6.0, midis: [64], staff: 'treble' },
    { beat: 6.5, midis: [69], staff: 'treble' },
    { beat: 7.0, midis: [71], staff: 'treble' },
    { beat: 7.5, midis: [73], staff: 'treble' },
    { beat: 8.0, midis: [71], staff: 'treble' },
    { beat: 8.5, midis: [69], staff: 'treble' },
    // Measure 4 — RH: dotted half (apparent landing on C#5)
    { beat: 9.0, midis: [73], staff: 'treble' }, // C#5

    // LH bass — pedal-style sustained tones; rough transcription.
    { beat: 0.0, midis: [45], staff: 'bass' }, // A2 (M1 bass)
    { beat: 3.5, midis: [52], staff: 'bass' }, // E3 (M2)
    { beat: 4.5, midis: [54], staff: 'bass' }, // F#3
    { beat: 6.0, midis: [42], staff: 'bass' }, // F#2 (M3)
    { beat: 9.0, midis: [38], staff: 'bass' }, // D2 (M4)
  ],
}

export const PIECES: Piece[] = [MIA_SEBASTIAN]
