import { create } from 'zustand'

export type VoiceConversationSendHandler = (text: string) => void

export type VoiceConversationState = {
  isOpen: boolean
  sendHandler: VoiceConversationSendHandler | null
  sendHandlerRegistrationId: number | null

  setOpen: (open: boolean) => void
  registerSendHandler: (handler: VoiceConversationSendHandler) => () => void
  sendText: (text: string) => boolean
}

let nextRegistrationId = 0

/**
 * Voice mode is app-level UI state rather than composer state. The composer is
 * intentionally replaceable when a draft becomes a real session, while the
 * active voice conversation must survive that transition.
 */
export const useVoiceStore = create<VoiceConversationState>()((set, get) => ({
  isOpen: false,
  sendHandler: null,
  sendHandlerRegistrationId: null,

  setOpen: (open) => set({ isOpen: open }),

  registerSendHandler: (handler) => {
    const registrationId = ++nextRegistrationId
    set({ sendHandler: handler, sendHandlerRegistrationId: registrationId })

    return () => {
      if (get().sendHandlerRegistrationId !== registrationId) return
      set({ sendHandler: null, sendHandlerRegistrationId: null })
    }
  },

  sendText: (text) => {
    const handler = get().sendHandler
    if (!handler) return false
    handler(text)
    return true
  },
}))
