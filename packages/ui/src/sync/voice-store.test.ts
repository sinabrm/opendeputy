import { afterEach, describe, expect, test } from 'bun:test'

import { useVoiceStore } from './voice-store'

afterEach(() => {
  useVoiceStore.setState({
    isOpen: false,
    sendHandler: null,
    sendHandlerRegistrationId: null,
  })
})

describe('voice store', () => {
  test('keeps voice mode open independently of the composer handler', () => {
    const sent: string[] = []
    const unregister = useVoiceStore.getState().registerSendHandler((text) => sent.push(text))

    useVoiceStore.getState().setOpen(true)
    expect(useVoiceStore.getState().sendText('first turn')).toBe(true)
    expect(sent).toEqual(['first turn'])

    // A ChatInput remount unregisters its handler, but must not close voice.
    unregister()
    expect(useVoiceStore.getState().isOpen).toBe(true)
    expect(useVoiceStore.getState().sendText('without composer')).toBe(false)
  })

  test('an old composer cleanup cannot unregister a newer handler', () => {
    const first: string[] = []
    const second: string[] = []
    const unregisterFirst = useVoiceStore.getState().registerSendHandler((text) => first.push(text))
    const unregisterSecond = useVoiceStore.getState().registerSendHandler((text) => second.push(text))

    unregisterFirst()
    expect(useVoiceStore.getState().sendText('new turn')).toBe(true)
    expect(first).toEqual([])
    expect(second).toEqual(['new turn'])

    unregisterSecond()
    expect(useVoiceStore.getState().sendText('no handler')).toBe(false)
  })
})
