import {
  waitForEvenAppBridge,
  TextContainerProperty,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { startMidi, midiNoteName } from './midi'

const bridge = await waitForEvenAppBridge()

const MAIN_ID = 1

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: MAIN_ID,
  containerName: 'main',
  content: 'MIDI: waiting...\nDouble-tap to exit.',
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
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

void startMidi(event => {
  if (event.type === 'on') held.add(event.midi)
  else held.delete(event.midi)

  const last = `${midiNoteName(event.midi)} ${event.type}`
  const heldList =
    held.size === 0 ? '(none)' : [...held].sort((a, b) => a - b).map(midiNoteName).join(', ')
  void setText(`Last: ${last}\nHeld: ${heldList}\nDouble-tap to exit.`)
}).then(() => {
  // startMidi resolves whether or not MIDI is actually available; if no inputs
  // were attached the user just sees the "waiting" message until they connect.
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
