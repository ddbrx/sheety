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
    // +0.5 so the 1px stroke lands on a single pixel row.
    const y = STAFF_TOP_Y + i * STAFF_LINE_GAP + 0.5
    ctx.beginPath()
    ctx.moveTo(STAFF_LEFT, y)
    ctx.lineTo(STAFF_RIGHT, y)
    ctx.stroke()
  }
}

function drawTrebleClef(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ffffff'
  // U+1D11E TREBLE CLEF. Falls back to a glyph in Apple Symbols / Noto Music
  // on most platforms; rendered into the bitmap at build time, so font
  // availability only matters in the dev environment.
  ctx.font = '64px "Apple Symbols", "Noto Music", "Bravura", serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('\u{1D11E}', 2, (STAFF_TOP_Y + STAFF_BOTTOM_Y) / 2 + 2)
}

export async function renderStaffBitmap(): Promise<Uint8Array> {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context')

  // Solid black background so the on-device greyscale conversion has a
  // predictable baseline (black = off, white = bright green).
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, STAFF_W, STAFF_H)

  drawStaffLines(ctx)
  drawTrebleClef(ctx)

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
