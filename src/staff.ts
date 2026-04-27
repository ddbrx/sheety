// Off-screen canvas renderer for a single five-line staff (treble or bass).
// Produces PNG bytes for ImageRawDataUpdate; the SDK handles 4-bit greyscale
// conversion on the device.

// Full logical staff width — covers nearly the whole HUD when tiled across
// two image containers (the per-container width caps at 288 per the SDK type
// defs, so a single container can't span the full 576 px display).
export const STAFF_W = 560
export const STAFF_H = 100
export const STAFF_HALF_W = STAFF_W / 2

export type Clef = 'treble' | 'bass'

interface ClefConfig {
  /** Unicode glyph for the clef. */
  glyph: string
  /** MIDI note that sits on the *bottom* line of the staff. */
  bottomLineMidi: number
  /** Canvas font sizing for the clef glyph. */
  font: string
  /**
   * Which staff line the glyph's reference point should target, indexed
   * 0 = top line. Treble's G-clef swirl wraps the G4 line (3 from top);
   * bass's F-clef dots straddle the F3 line (1 from top).
   */
  anchorLineFromTop: number
  /** Pixel fine-tune applied on top of the anchor line. */
  fineTuneY: number
}

const CLEFS: Record<Clef, ClefConfig> = {
  treble: {
    glyph: '\u{1D11E}', // 𝄞 G clef
    bottomLineMidi: 64, // E4
    font: '60px "Apple Symbols", "Noto Music", "Bravura", serif',
    anchorLineFromTop: 3, // G4 line — swirl center
    fineTuneY: 8, // Apple Symbols draws this glyph above the alphabetic baseline
  },
  bass: {
    glyph: '\u{1D122}', // 𝄢 F clef
    bottomLineMidi: 43, // G2
    font: '48px "Apple Symbols", "Noto Music", "Bravura", serif',
    anchorLineFromTop: 1, // F3 line — dots straddle this
    fineTuneY: 14,
  },
}

// Five staff lines, spaced 10px, centred vertically with room for ledger lines.
const STAFF_TOP_Y = 30 // y of top line (F5 in treble / A3 in bass)
const STAFF_LINE_GAP = 10
const STAFF_BOTTOM_Y = STAFF_TOP_Y + STAFF_LINE_GAP * 4 // y of bottom line (E4 in treble / G2 in bass)
// Lines start to the right of the clef so the clef is unambiguously on top
// (no visible line strokes underneath the glyph). The clef is rendered first
// in clef-only space, lines start at STAFF_LEFT, and noteheads sit further right.
// CONNECT_X is the x-column of the vertical line that visually joins the two
// staves; sits just inside the left edge, before the clef glyph.
const CONNECT_X = 2
const CLEF_X = 6
const STAFF_LEFT = 56
const STAFF_RIGHT = STAFF_W - 8
const NOTEHEAD_X = 120

// Each diatonic step is half a line gap.
const STEP_PX = STAFF_LINE_GAP / 2

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

// Step 0 = bottom line of the chosen clef's staff. Positive steps go up.
export function midiToStaffStep(midi: number, clef: Clef): number {
  return midiToDiatonic(midi) - midiToDiatonic(CLEFS[clef].bottomLineMidi)
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

// Vertical line on the left that visually connects the treble and bass
// staves into a grand staff. Each bitmap draws its half of the line; in the
// HUD the bitmaps overlap slightly so the two halves form one continuous
// stroke from the treble's top line down to the bass's bottom line.
function drawConnectingLine(ctx: CanvasRenderingContext2D, clef: Clef): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  const x = CONNECT_X + 0.5
  // Treble: from its top staff line down to the bottom of the bitmap.
  // Bass:  from the top of the bitmap down to its bottom staff line.
  const y0 = clef === 'treble' ? STAFF_TOP_Y : 0
  const y1 = clef === 'treble' ? STAFF_H : STAFF_BOTTOM_Y
  ctx.beginPath()
  ctx.moveTo(x, y0)
  ctx.lineTo(x, y1)
  ctx.stroke()
}

function drawClef(ctx: CanvasRenderingContext2D, clef: Clef): void {
  const cfg = CLEFS[clef]
  ctx.fillStyle = '#ffffff'
  ctx.font = cfg.font
  // Alphabetic baseline targets the clef's identifying line directly:
  // SMuFL convention puts the G-clef baseline on the G line and the F-clef
  // baseline on the F line. Apple Symbols follows this for its music glyphs.
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const anchorY = STAFF_TOP_Y + cfg.anchorLineFromTop * STAFF_LINE_GAP
  ctx.fillText(cfg.glyph, CLEF_X, anchorY + cfg.fineTuneY)
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

function drawSharp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffffff'
  ctx.font = '16px "Apple Symbols", "Bravura", "Noto Music", serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('♯', x, y + 1)
}

function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
}

async function renderFullStaff(
  clef: Clef,
  activeNotes: ReadonlySet<number>,
): Promise<HTMLCanvasElement> {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, STAFF_W, STAFF_H)

  drawStaffLines(ctx)
  drawConnectingLine(ctx, clef)
  drawClef(ctx, clef)

  const ledgerSet = new Set<number>()
  for (const midi of activeNotes) {
    for (const ls of ledgerLinesFor(midiToStaffStep(midi, clef))) ledgerSet.add(ls)
  }
  for (const step of ledgerSet) drawLedgerLine(ctx, NOTEHEAD_X, step)

  for (const midi of activeNotes) {
    const step = midiToStaffStep(midi, clef)
    const y = staffStepY(step)
    drawNotehead(ctx, NOTEHEAD_X, y)
    if (isBlackKey(midi)) drawSharp(ctx, NOTEHEAD_X - 13, y)
  }

  return canvas
}

// Renders the full-width staff and slices it into left/right halves so the
// caller can push each half into its own image container. Returns PNG bytes
// because that's what updateImageRawData consumes.
export async function renderStaffHalves(
  clef: Clef,
  activeNotes: ReadonlySet<number> = new Set(),
): Promise<{ left: Uint8Array; right: Uint8Array }> {
  const full = await renderFullStaff(clef, activeNotes)
  return {
    left: await sliceToPng(full, 0, 0, STAFF_HALF_W, STAFF_H),
    right: await sliceToPng(full, STAFF_HALF_W, 0, STAFF_HALF_W, STAFF_H),
  }
}

// All-black PNG of half-staff dimensions. Cached after first call so mode
// switches don't re-encode it. On hardware, black pixels are off, so this
// effectively clears whatever was previously displayed in the container.
let cachedBlankBytes: Uint8Array | null = null
export async function renderBlankHalfBitmap(): Promise<Uint8Array> {
  if (cachedBlankBytes) return cachedBlankBytes
  const c = document.createElement('canvas')
  c.width = STAFF_HALF_W
  c.height = STAFF_H
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context for blank bitmap')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, STAFF_HALF_W, STAFF_H)
  cachedBlankBytes = await canvasToPngBytes(c)
  return cachedBlankBytes
}

async function sliceToPng(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context for slice')
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvasToPngBytes(c)
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
