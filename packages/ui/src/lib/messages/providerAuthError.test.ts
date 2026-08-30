import { describe, expect, test } from "bun:test"

import { isLikelyTransientProviderFailure } from "./providerAuthError"

describe("isLikelyTransientProviderFailure", () => {
  const recoverable = [
    "AI_APICallError: upstream request failed",
    "[invalid_request_error] PDF parser FaaS call failed",
    "gateway timeout (504)",
    "network connection reset",
  ]
  for (const message of recoverable) {
    test(`accepts recoverable provider failures: ${message}`, () => {
      expect(isLikelyTransientProviderFailure(message)).toBe(true)
    })
  }

  const permanent = [
    "invalid api key",
    "permission denied",
    "unsupported model",
    "MessageAbortedError: user abort",
  ]
  for (const message of permanent) {
    test(`rejects permanent or user-selected stops: ${message}`, () => {
      expect(isLikelyTransientProviderFailure(message)).toBe(false)
    })
  }
})
