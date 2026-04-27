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
import { renderStaffHalves, STAFF_HALF_W, STAFF_H, type Clef } from './staff'

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

// Notes split at middle C (60). Right hand / treble = >= C4; left hand /
// bass = < C4. Middle C itself shows on the treble staff with one ledger
// line below.
function splitByClef(notes: ReadonlySet<number>): { treble: Set<number>; bass: Set<number> } {
  const treble = new Set<number>()
  const bass = new Set<number>()
  for (const m of notes) (m >= 60 ? treble : bass).add(m)
  return { treble, bass }
}

// Coalesced per-staff pushes. Each clef pushes both of its half-images on
// every update; the two clef slots run independently so a slow BLE write on
// one staff doesn't block the other.
type StaffSlot = {
  clef: Clef
  leftId: number
  rightId: number
  leftName: string
  rightName: string
  inFlight: boolean
  dirty: boolean
}
const slots: StaffSlot[] = [
  { clef: 'treble', leftId: TREBLE_L_ID, rightId: TREBLE_R_ID, leftName: 'treble-l', rightName: 'treble-r', inFlight: false, dirty: true },
  { clef: 'bass', leftId: BASS_L_ID, rightId: BASS_R_ID, leftName: 'bass-l', rightName: 'bass-r', inFlight: false, dirty: true },
]

async function pushStaff(slot: StaffSlot): Promise<void> {
  slot.dirty = true
  if (slot.inFlight) return
  slot.inFlight = true
  try {
    while (slot.dirty) {
      slot.dirty = false
      const split = splitByClef(held)
      const { left, right } = await renderStaffHalves(slot.clef, split[slot.clef])
      const okL = await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: slot.leftId,
          containerName: slot.leftName,
          imageData: left,
        }),
      )
      const okR = await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: slot.rightId,
          containerName: slot.rightName,
          imageData: right,
        }),
      )
      console.log(`[${slot.clef}] pushed L=${left.length}B/${okL} R=${right.length}B/${okR}`)
    }
  } finally {
    slot.inFlight = false
  }
}

function pushAll(): void {
  for (const slot of slots) void pushStaff(slot)
}

// Initial render: both staves show their lines + clef glyph.
for (const slot of slots) await pushStaff(slot)

void startMidi(event => {
  if (event.type === 'on') held.add(event.midi)
  else held.delete(event.midi)

  const last = `${midiNoteName(event.midi)} ${event.type}`
  const heldList =
    held.size === 0 ? '(none)' : [...held].sort((a, b) => a - b).map(midiNoteName).join(', ')
  void setText(`Last: ${last}\nHeld: ${heldList}`)
  pushAll()
}).then(() => {
  console.log('[midi] startMidi resolved')
})

const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = event.sysEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null

  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
