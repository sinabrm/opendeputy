export const PROVIDER_AUTH_FAILURE_MESSAGE = "Authentication failed for this provider. Please re-authenticate and retry.";

export const isLikelyProviderAuthFailure = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const detail = value.toLowerCase().trim();
  if (!detail) {
    return false;
  }

  if (
    detail.includes("token refresh failed") ||
    detail.includes("unauthorized") ||
    detail.includes("invalid token") ||
    detail.includes("expired token")
  ) {
    return true;
  }

  const hasOauth = detail.includes("oauth");
  const hasOauthFailure =
    detail.includes("failed") || detail.includes("invalid") || detail.includes("expired");
  if (hasOauth && hasOauthFailure) {
    return true;
  }

  const has401 = /\b401\b/.test(detail);
  const hasAuthContext =
    detail.includes("auth") || detail.includes("token") || detail.includes("unauthorized");

  return has401 && hasAuthContext;
};

// Errors in this group are normally recoverable transport/provider failures.
// The server-side session-recovery runtime retries an empty turn for them; the
// UI uses the same classification to avoid leaving a stale raw error bubble
// after a later assistant continuation has succeeded.
export const isLikelyTransientProviderFailure = (value: unknown): boolean => {
  if (typeof value !== "string") return false;

  const detail = value.toLowerCase().trim();
  if (!detail || isLikelyProviderAuthFailure(value)) return false;

  if (
    detail.includes("messageabortederror")
    || detail.includes("user abort")
    || detail.includes("permission denied")
    || detail.includes("access denied")
    || detail.includes("not allowed")
    || detail.includes("invalid api key")
    || detail.includes("insufficient balance")
    || detail.includes("content policy")
    || detail.includes("unsupported")
    || detail.includes("not found")
  ) {
    return false;
  }

  if (detail.includes("invalid_request_error") && !/(parser faas|timeout|temporar)/i.test(detail)) {
    return false;
  }

  return /(?:ai_apicallerror|upstream request failed|parser faas|rate limit|\b(?:408|429|5\d\d)\b|timeout|timed?[- ]?out|network|socket|connection|fetch|temporar|overloaded|unavailable|reset)/i.test(detail);
};
