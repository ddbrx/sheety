import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ImageContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { startMidi, midiNoteName } from './midi'
import { renderStaffBitmap } from './staff'

// HUD canvas: 576 x 288, 4-bit greyscale. Image containers are capped at
// 200 x 100 by the docs (looser limits in the .d.ts are not safe).
const HUD_W = 576
const HUD_H = 288
const STAFF_W = 200
const STAFF_H = 100
const STAFF_X = Math.floor((HUD_W - STAFF_W) / 2)
const STAFF_Y = 40

const EVENT_LAYER_ID = 1
const NOTE_TEXT_ID = 2
const STAFF_IMG_ID = 3

const bridge = await waitForEvenAppBridge()

// Full-screen transparent text container. Image containers can't capture
// events, so this layer absorbs taps (including double-tap-to-exit).
const eventLayer = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: HUD_W,
  height: HUD_H,
  borderWidth: 0,
  borderColor: 0,
  paddingLength: 0,
  containerID: EVENT_LAYER_ID,
  containerName: 'events',
  content: ' ',
  isEventCapture: 1,
})

const noteText = new TextContainerProperty({
  xPosition: 0,
  yPosition: STAFF_Y + STAFF_H + 20,
  width: HUD_W,
  height: 60,
  borderWidth: 0,
  borderColor: 0,
  paddingLength: 4,
  containerID: NOTE_TEXT_ID,
  containerName: 'notes',
  content: '—',
  isEventCapture: 0,
})

const staffImage = new ImageContainerProperty({
  xPosition: STAFF_X,
  yPosition: STAFF_Y,
  width: STAFF_W,
  height: STAFF_H,
  containerID: STAFF_IMG_ID,
  containerName: 'staff',
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [eventLayer, noteText],
    imageObject: [staffImage],
  }),
)

console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)

// Push the static staff bitmap once. updateImageRawData cannot run during
// page creation, so it has to happen after createStartUpPageContainer resolves.
const staffBytes = await renderStaffBitmap()
const staffPushResult = await bridge.updateImageRawData(
  new ImageRawDataUpdate({
    containerID: STAFF_IMG_ID,
    containerName: 'staff',
    imageData: staffBytes,
  }),
)
console.log('Staff bitmap pushed:', staffPushResult)

// Currently-pressed MIDI note numbers. Re-rendered on every change.
const activeNotes = new Set<number>()

function renderNoteText(): string {
  if (activeNotes.size === 0) return '—'
  return [...activeNotes].sort((a, b) => a - b).map(midiNoteName).join(', ')
}

// Coalesce concurrent text pushes: if one is already in flight, mark dirty
// and let the running loop pick up the latest content when it returns.
let textInFlight = false
let textDirty = false

async function pushNoteText(): Promise<void> {
  textDirty = true
  if (textInFlight) return
  textInFlight = true
  try {
    while (textDirty) {
      textDirty = false
      const content = renderNoteText()
      await bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: NOTE_TEXT_ID,
          contentOffset: 0,
          contentLength: content.length,
          content,
        }),
      )
    }
  } finally {
    textInFlight = false
  }
}

void startMidi(event => {
  if (event.type === 'on') activeNotes.add(event.midi)
  else activeNotes.delete(event.midi)
  void pushNoteText()
})

// Event routing, critical details:
//   • Protobuf omits zero-value fields on the wire, so CLICK_EVENT (0)
//     arrives as `undefined`. Always coalesce with `?? 0` before comparing.
//   • Taps/double-taps/lifecycle come through `event.sysEvent`.
//     Scroll gestures come through `event.textEvent`. Never mix them.
//   • Double-tap → `shutDownPageContainer(1)` is a root-level check: it
//     must fire no matter which envelope the event arrives in, so users
//     can always exit the app.
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
