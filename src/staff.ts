// Off-screen canvas renderer for the treble-clef staff. Produces PNG bytes
// for ImageRawDataUpdate; the SDK handles greyscale conversion on the device.

export const STAFF_W = 200
export const STAFF_H = 100

// Five staff lines, spaced 10px, centred vertically with room for ledger lines.
const STAFF_TOP_Y = 30 // y of top line (F5)
const STAFF_LINE_GAP = 10
const STAFF_BOTTOM_Y = STAFF_TOP_Y + STAFF_LINE_GAP * 4 // y of bottom line (E4)
const STAFF_LEFT = 26
const STAFF_RIGHT = STAFF_W - 6
const NOTEHEAD_X = 88

// Each diatonic step is half a line gap.
const STEP_PX = STAFF_LINE_GAP / 2

// Reference: E4 (MIDI 64) sits on the bottom staff line. We give it
// "staff step 0"; positive steps go up, negative go down (each step = one
// diatonic position, e.g. C4 → -2).
const E4_DIATONIC = midiToDiatonic(64)

// Map pitch class -> diatonic offset within the octave. Black keys snap
// to the white key BELOW (per the brief); accidentals are layered on later.
const PC_TO_DIATONIC: readonly number[] = [
  0, // C
  0, // C# -> C
  1, // D
  1, // D# -> D
  2, // E
  3, // F
  3, // F# -> F
  4, // G
  4, // G# -> G
  5, // A
  5, // A# -> A
  6, // B
]

function midiToDiatonic(midi: number): number {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  return octave * 7 + PC_TO_DIATONIC[pc]
}

export function midiToStaffStep(midi: number): number {
  return midiToDiatonic(midi) - E4_DIATONIC
}

function staffStepY(step: number): number {
  return STAFF_BOTTOM_Y - step * STEP_PX
}

// Returns the diatonic steps where ledger lines are needed for a given note.
// Below-staff lines are at -2 (C4), -4 (A3), -6 (F3) ...
// Above-staff lines start at +10 (A5), then +12, +14 ...
function ledgerLinesFor(step: number): number[] {
  const lines: number[] = []
  if (step <= -2) {
    const lowest = Math.ceil(step / 2) * 2
    for (let y = -2; y >= lowest; y -= 2) lines.push(y)
  } else if (step >= 10) {
    const highest = Math.floor(step / 2) * 2
    for (let y = 10; y <= highest; y += 2) lines.push(y)
  }
  return lines
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = STAFF_W
  canvas.height = STAFF_H
  return canvas
}

function drawStaffLines(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const y = STAFF_TOP_Y + i * STAFF_LINE_GAP + 0.5
    ctx.beginPath()
    ctx.moveTo(STAFF_LEFT, y)
    ctx.lineTo(STAFF_RIGHT, y)
    ctx.stroke()
  }
}

function drawTrebleClef(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ffffff'
  ctx.font = '64px "Apple Symbols", "Noto Music", "Bravura", serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('\u{1D11E}', 2, (STAFF_TOP_Y + STAFF_BOTTOM_Y) / 2 + 2)
}

function drawLedgerLine(ctx: CanvasRenderingContext2D, x: number, step: number): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  const y = staffStepY(step) + 0.5
  ctx.beginPath()
  ctx.moveTo(x - 9, y)
  ctx.lineTo(x + 9, y)
  ctx.stroke()
}

function drawNotehead(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(x, y, 5.5, 4, 0, 0, Math.PI * 2)
  ctx.fill()
}

export async function renderStaffBitmap(activeNotes: ReadonlySet<number> = new Set()): Promise<Uint8Array> {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, STAFF_W, STAFF_H)

  drawStaffLines(ctx)
  drawTrebleClef(ctx)

  // Dedupe ledger lines across the chord, then draw them once each.
  const ledgerSet = new Set<number>()
  for (const midi of activeNotes) {
    for (const ls of ledgerLinesFor(midiToStaffStep(midi))) ledgerSet.add(ls)
  }
  for (const step of ledgerSet) drawLedgerLine(ctx, NOTEHEAD_X, step)

  for (const midi of activeNotes) {
    const step = midiToStaffStep(midi)
    drawNotehead(ctx, NOTEHEAD_X, staffStepY(step))
  }

  return canvasToPngBytes(canvas)
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('canvas.toBlob returned null'))
        return
      }
      blob
        .arrayBuffer()
        .then(buf => resolve(new Uint8Array(buf)))
        .catch(reject)
    }, 'image/png')
  })
}
