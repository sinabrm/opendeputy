# Automatic Session Recovery

Server-side recovery for an OpenCode model stream that settles without a
usable answer. This covers the known empty `finish: unknown` response, an
assistant record that was created but never received its finish marker, and a
bounded set of transient provider errors with no visible answer.

## Flow

1. A parent session's idle event starts a one-second quiet window. An empty
   unfinished assistant event also arms a 15-second watchdog, so a missing
   `idle`/`error` event cannot leave the turn stranded.
2. The runtime reads the session and its recent messages. Recovery applies only
   when the tail is an empty/unfinished assistant message or a retryable
   provider failure with no visible answer, and the history still contains the
   visible user turn it belongs to.
3. The tail is read again immediately before continuing. A new user message or
   another runner moving the session cancels recovery.
4. The same provider, model, agent, and variant receive a synthetic continuation
   through `prompt_async`. OpenDeputy's turn projection hides that synthetic user
   message and merges the resumed assistant work into the existing chat turn.

## Safety bounds

- Assistant turns containing visible text, a file, or a tool part are
  never retried automatically. User aborts, permission failures, and known
  permanent errors are also excluded.
- A failed tool result is kept in history. The hidden continuation tells the
  model to repair only the failed step and inspect state before repeating any
  side effect.
- A user message arriving during the quiet window cancels the timer.
- If OpenCode still reports the session as `busy`/`retry`, recovery waits and
  rechecks with a 30-second backoff (six checks maximum) instead of sending a
  duplicate prompt while work is active.
- Child/subagent sessions are excluded.
- At most two recovery prompts are allowed after one visible user message. The
  count comes from session history, so a server restart cannot reset the bound.
- The continuation tells the agent to preserve completed tool results, avoid
  repeating completed side effects, and inspect current state before any new
  side effect.

The runtime is event-driven and does not scan dormant sessions.
