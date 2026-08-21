# Empty Unknown-Finish Recovery

Server-side recovery for an OpenCode model stream that settles with
`finish: unknown` without text, tool calls, files, or an error.

## Flow

1. A parent session's idle event starts a one-second quiet window.
2. The runtime reads the session and its recent messages. Recovery applies only
   when the tail is a completed, empty assistant message whose finish is
   `unknown` and the history still contains the visible user turn it belongs to.
3. The tail is read again immediately before continuing. A new user message or
   another runner moving the session cancels recovery.
4. The same provider, model, agent, and variant receive a synthetic continuation
   through `prompt_async`. OpenDeputy's turn projection hides that synthetic user
   message and merges the resumed assistant work into the existing chat turn.

## Safety bounds

- Assistant turns containing text, a tool part, a file, or an error are never
  retried automatically.
- A user message arriving during the quiet window cancels the timer.
- Child/subagent sessions are excluded.
- At most two recovery prompts are allowed after one visible user message. The
  count comes from session history, so a server restart cannot reset the bound.
- The continuation tells the agent to preserve completed tool results, avoid
  repeating completed side effects, and inspect current state before any new
  side effect.

The runtime is event-driven and does not scan dormant sessions.
