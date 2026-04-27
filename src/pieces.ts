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
// Original key A major; transposed up a minor third to C major (no sharps)
// so noteheads sit on white keys and the rendering stays clean. Time: 3/4.
// First four measures only — best-read of the score image.
export const MIA_SEBASTIAN: Piece = {
  name: "Mia & Sebastian's Theme",
  composer: 'Justin Hurwitz',
  beatsPerMeasure: 3,
  totalBeats: 12,
  events: [
    // Measure 1 — RH: G4 C5 D5 E5 D5 C5 (six eighth notes)
    { beat: 0.0, midis: [67], staff: 'treble' }, // G4
    { beat: 0.5, midis: [72], staff: 'treble' }, // C5
    { beat: 1.0, midis: [74], staff: 'treble' }, // D5
    { beat: 1.5, midis: [76], staff: 'treble' }, // E5
    { beat: 2.0, midis: [74], staff: 'treble' }, // D5
    { beat: 2.5, midis: [72], staff: 'treble' }, // C5
    // Measure 2 — RH: C5 dotted half (3 beats)
    { beat: 3.0, midis: [72], staff: 'treble' },
    // Measure 3 — RH: same melodic cell as M1
    { beat: 6.0, midis: [67], staff: 'treble' },
    { beat: 6.5, midis: [72], staff: 'treble' },
    { beat: 7.0, midis: [74], staff: 'treble' },
    { beat: 7.5, midis: [76], staff: 'treble' },
    { beat: 8.0, midis: [74], staff: 'treble' },
    { beat: 8.5, midis: [72], staff: 'treble' },
    // Measure 4 — RH: E5 dotted half
    { beat: 9.0, midis: [76], staff: 'treble' }, // E5

    // LH bass — pedal-style sustained tones; rough transcription.
    { beat: 0.0, midis: [48], staff: 'bass' }, // C3 (M1 bass)
    { beat: 3.5, midis: [55], staff: 'bass' }, // G3 (M2)
    { beat: 4.5, midis: [57], staff: 'bass' }, // A3
    { beat: 6.0, midis: [45], staff: 'bass' }, // A2 (M3)
    { beat: 9.0, midis: [41], staff: 'bass' }, // F2 (M4)
  ],
}

export const PIECES: Piece[] = [MIA_SEBASTIAN]
