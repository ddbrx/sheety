import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { startMidi, midiNoteName } from './midi'
import { renderStaffHalves, renderBlankHalfBitmap, STAFF_HALF_W, STAFF_H, type Clef } from './staff'

const bridge = await waitForEvenAppBridge()

const MAIN_ID = 1
const TREBLE_L_ID = 2
const TREBLE_R_ID = 3
const BASS_L_ID = 4
const BASS_R_ID = 5

// Grand-staff layout: each clef is two side-by-side image containers
// (each STAFF_HALF_W = 280 wide), giving 560 px total — nearly full HUD.
// Image containers can't capture taps, so the full-screen text container
// still owns the event surface.
const STAFF_LEFT_X = (576 - STAFF_HALF_W * 2) / 2 // 8
const STAFF_RIGHT_X = STAFF_LEFT_X + STAFF_HALF_W // 288
// Bitmaps stack EXACTLY adjacent (bass starts where treble ends) so neither
// is clipped and the connecting line — drawn by each bitmap as its own half —
// meets cleanly at the boundary.
const TREBLE_Y = 20
const BASS_Y = TREBLE_Y + STAFF_H // 120
const TEXT_Y = BASS_Y + STAFF_H + 6 // 226

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: TEXT_Y,
  width: 576,
  height: 288 - TEXT_Y, // 58
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: MAIN_ID,
  containerName: 'main',
  content: 'MIDI: waiting... (double-tap to exit)',
  isEventCapture: 1,
})

const makeStaffHalf = (id: number, name: string, x: number, y: number) =>
  new ImageContainerProperty({
    xPosition: x,
    yPosition: y,
    width: STAFF_HALF_W,
    height: STAFF_H,
    containerID: id,
    containerName: name,
  })

const trebleLeft = makeStaffHalf(TREBLE_L_ID, 'treble-l', STAFF_LEFT_X, TREBLE_Y)
const trebleRight = makeStaffHalf(TREBLE_R_ID, 'treble-r', STAFF_RIGHT_X, TREBLE_Y)
const bassLeft = makeStaffHalf(BASS_L_ID, 'bass-l', STAFF_LEFT_X, BASS_Y)
const bassRight = makeStaffHalf(BASS_R_ID, 'bass-r', STAFF_RIGHT_X, BASS_Y)

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 5,
    textObject: [mainText],
    imageObject: [trebleLeft, trebleRight, bassLeft, bassRight],
  }),
)
if (result !== 0) {
  console.error('createStartUpPageContainer failed:', result)
} else {
  console.log('Page created: success')
}

// Coalesced text push — at most one in flight; trailing render wins.
let textInFlight = false
let pendingText: string | null = null

async function setText(content: string): Promise<void> {
  pendingText = content
  if (textInFlight) return
  textInFlight = true
  try {
    while (pendingText !== null) {
      const next = pendingText
      pendingText = null
      const ok = await bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: MAIN_ID,
          containerName: 'main',
          content: next,
        }),
      )
      console.log(`[hud] textContainerUpgrade -> ${ok}`)
    }
  } finally {
    textInFlight = false
  }
}

const held = new Set<number>()

type Mode = 'free-play' | 'exercises' | 'pieces'
const MODES: readonly Mode[] = ['free-play', 'exercises', 'pieces'] as const
const MODE_LABELS: Record<Mode, string> = {
  'free-play': 'Free play',
  exercises: 'Exercises',
  pieces: 'Pieces',
}
let mode: Mode = 'free-play'

function cycleMode(direction: 'up' | 'down'): void {
  const i = MODES.indexOf(mode)
  const next =
    direction === 'down'
      ? MODES[(i + 1) % MODES.length]
      : MODES[(i - 1 + MODES.length) % MODES.length]
  if (next === mode) return
  mode = next
  console.log(`[mode] -> ${mode}`)
  // Re-render every container for the new mode.
  for (const slot of slots) void pushSlot(slot)
  void pushTextForMode()
}

// Notes split at middle C (60). Right hand / treble = >= C4; left hand /
// bass = < C4. Middle C itself shows on the treble staff with one ledger
// line below.
function splitByClef(notes: ReadonlySet<number>): { treble: Set<number>; bass: Set<number> } {
  const treble = new Set<number>()
  const bass = new Set<number>()
  for (const m of notes) (m >= 60 ? treble : bass).add(m)
  return { treble, bass }
}

// Coalesced per-half pushes. BLE caps updateImageRawData at ~0.5–2 s per
// call, so we minimise traffic by pushing only what actually changes:
//   • Right halves are pushed once at startup, then never again (they hold
//     only static staff lines — noteheads sit in the left half, x≈120 of 280).
//   • Left halves are pushed only for the staff whose note set changed.
type HalfSlot = {
  containerID: number
  containerName: string
  clef: Clef
  side: 'left' | 'right'
  inFlight: boolean
  dirty: boolean
}
const slots: HalfSlot[] = [
  { containerID: TREBLE_L_ID, containerName: 'treble-l', clef: 'treble', side: 'left',  inFlight: false, dirty: true },
  { containerID: TREBLE_R_ID, containerName: 'treble-r', clef: 'treble', side: 'right', inFlight: false, dirty: true },
  { containerID: BASS_L_ID,   containerName: 'bass-l',   clef: 'bass',   side: 'left',  inFlight: false, dirty: true },
  { containerID: BASS_R_ID,   containerName: 'bass-r',   clef: 'bass',   side: 'right', inFlight: false, dirty: true },
]

async function bytesForSlot(slot: HalfSlot): Promise<Uint8Array> {
  if (mode !== 'free-play') return renderBlankHalfBitmap()
  const split = splitByClef(held)
  const halves = await renderStaffHalves(slot.clef, split[slot.clef])
  return halves[slot.side]
}

async function pushSlot(slot: HalfSlot): Promise<void> {
  slot.dirty = true
  if (slot.inFlight) return
  slot.inFlight = true
  try {
    while (slot.dirty) {
      slot.dirty = false
      const bytes = await bytesForSlot(slot)
      const ok = await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: slot.containerID,
          containerName: slot.containerName,
          imageData: bytes,
        }),
      )
      console.log(`[${slot.containerName}] pushed ${bytes.length}B -> ${ok}`)
    }
  } finally {
    slot.inFlight = false
  }
}

function pushTextForMode(): void {
  const header = `Mode: ${MODE_LABELS[mode]}  (swipe to change)`
  if (mode === 'free-play') {
    const heldList =
      held.size === 0 ? '(none)' : [...held].sort((a, b) => a - b).map(midiNoteName).join(', ')
    void setText(`${header}\nHeld: ${heldList}`)
  } else {
    void setText(`${header}\n(coming soon)`)
  }
}

const leftSlot = (clef: Clef): HalfSlot =>
  slots.find(s => s.clef === clef && s.side === 'left')!

// Initial render: paint all four halves once and seed the text container
// with the mode header so the user sees something before any MIDI input.
for (const slot of slots) await pushSlot(slot)
pushTextForMode()

void startMidi(event => {
  if (event.type === 'on') held.add(event.midi)
  else held.delete(event.midi)

  // Text feedback runs in every mode (flicker-free / fast).
  pushTextForMode()
  // Staff bitmaps only matter in Free play; other modes show all-black.
  if (mode === 'free-play') {
    const clef: Clef = event.midi >= 60 ? 'treble' : 'bass'
    void pushSlot(leftSlot(clef))
  }
}).then(() => {
  console.log('[midi] startMidi resolved')
})

const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null
  const anyType = sysType ?? textType

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  // Swipe up = previous mode, swipe down = next. Scroll events arrive on
  // textEvent per the SDK convention but we accept either envelope.
  if (anyType === OsEventTypeList.SCROLL_TOP_EVENT) {
    cycleMode('up')
    return
  }
  if (anyType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    cycleMode('down')
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
