// Exercise drills. Each drill is a sequence of MIDI notes the user plays
// in order — advance one step per correct note.

export type Drill = {
  name: string
  sequence: number[]
}

export type DrillSet = {
  name: string
  drills: Drill[]
}

// Major scale interval pattern (W-W-H-W-W-W-H), in semitones from the root.
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12] as const

// Ascending root → octave, then descending back without re-playing the top.
function majorScale(rootMidi: number): number[] {
  const asc = MAJOR_INTERVALS.map(i => rootMidi + i)
  const desc = MAJOR_INTERVALS.slice(0, -1)
    .slice()
    .reverse()
    .map(i => rootMidi + i)
  return [...asc, ...desc]
}

// Circle-of-fifths order. Starting roots chosen to keep each scale near
// middle C (C4 = MIDI 60), so the staff shows it without huge ledger lines.
export const MAJOR_SCALES: DrillSet = {
  name: 'Major scales',
  drills: [
    { name: 'C major', sequence: majorScale(60) }, // C4
    { name: 'G major', sequence: majorScale(67) }, // G4
    { name: 'D major', sequence: majorScale(62) }, // D4
    { name: 'A major', sequence: majorScale(57) }, // A3
    { name: 'E major', sequence: majorScale(64) }, // E4
    { name: 'B major', sequence: majorScale(59) }, // B3
    { name: 'F# major', sequence: majorScale(54) }, // F#3
    { name: 'F major', sequence: majorScale(53) }, // F3
    { name: 'Bb major', sequence: majorScale(58) }, // Bb3
    { name: 'Eb major', sequence: majorScale(51) }, // Eb3
    { name: 'Ab major', sequence: majorScale(56) }, // Ab3
    { name: 'Db major', sequence: majorScale(61) }, // Db4
  ],
}

export const DRILL_SETS: DrillSet[] = [MAJOR_SCALES]
