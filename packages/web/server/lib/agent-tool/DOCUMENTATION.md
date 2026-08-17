# Managed OpenDeputy Agent Tools

## Purpose

This module exposes OpenDeputy to agents as typed OpenCode custom tools. There
are three, because controlling sessions, driving a page, and using local workspace capabilities are separate intents
the user can want independently:

- `opendeputy` — projects, sessions, worktrees, and scheduled tasks. Enabled
  while the persisted `agentControlToolEnabled` setting is not `false`.
- `opendeputy_web` — looking at and interacting with the page in OpenDeputy's
  browser panel. Enabled while `agentWebToolEnabled` is not `false`.
- `opendeputy_workspace` — local memory, document conversion, speech synthesis,
  and optional activity history. It follows the agent-control setting.

The control settings default to on, are toggled in Settings → General → OpenCode
CLI, and apply on the next managed OpenCode restart. Desktop packages also
inject the managed agent kit. It defines `playwright`, `open_computer_use`,
`open_browser_use`, `computer_use`, `agent_overlay`, `touchpoint`,
`visual_grounding`, and `workspace_tools`; all eight start by default. TouchPoint
runs from the portable Python runtime bundled in the Windows installer, so it
does not depend on a system Python or an OpenChamber tools directory. Discovery is allowed by default and
computer-changing actions require approval. Four packaged skill paths join
OpenCode's built-in `customize-opencode` skill.

Each tool carries only its own actions and
only the parameters those actions use, so turning one off removes its inputs
from the schema rather than leaving them visible. The plugin is injected only
when OpenDeputy launches and owns the OpenCode process, and not at all when
both settings are `false`.

- The plugin accepts the action's inputs either inside `parameters` or beside
  `action`, because models produce both shapes; an explicit `parameters` object
  wins on a conflict. Rejecting the flattened shape turned a call that plainly
  carried a `url` into "url is required", which reads as a broken tool rather
  than a malformed call.

## Runtime flow

1. The OpenDeputy HTTP listener binds and publishes its authoritative port.
2. `prepareManagedOpenCodeEnv()` materializes the plugin under
   `<openchamber-data-dir>/agent-tool/` and appends its `file://` URL to
   `OPENCODE_CONFIG_CONTENT` without replacing existing plugin entries.
3. A random per-child token and loopback callback URL are added only to the
   managed OpenCode child environment.
4. The plugin calls `POST /api/openchamber/agent-tool` with its typed input and
   OpenCode's authoritative session directory.
5. The route delegates the fixed action allowlist directly to the shared
   OpenDeputy control service. The CLI uses the same service through its
   authenticated HTTP adapter, so Goal Mode ordering, wait behavior,
   partial-failure reporting, and scheduled-task contracts have one owner.
6. Each action definition owns a short presentation title and a separate
   agent-facing description. The generated schema uses the description to state
   required inputs or one non-obvious behavior, while completed calls use the
   short title in native tool metadata.

## Agent context budget

- The tool exposes one shared parameter object rather than repeating parameters
  in a large per-action union. Action descriptions carry only required inputs,
  defaults, or one non-obvious semantic detail.
- Obvious fields rely on their names and JSON types. Parameter descriptions are
  reserved for formats, dependencies, scope, and behavior that cannot be safely
  inferred from the field name.
- Session dispatches do not wait by default. Agents are told to set `wait` only
  when the user asks or the next step requires the completed result.
- The tool exposes only agent-relevant actions
  (`OPENCHAMBER_AGENT_TOOL_ACTIONS`): `schedule.status` stays CLI-only because
  `schedule.list` already returns scheduler status, and enable/disable are one
  `schedule.toggle` action driven by the `disabled` boolean.
- The tool description frames intent: created sessions and scheduled tasks are
  user-facing work the user follows up with, never a channel for the agent to
  delegate parts of its own current task.
- Optional behavior switches (`worktree`, `goal`, `agent`, `variant`, `wait`)
  state their default and an explicit "only when the user asks" rule so agents
  do not invent worktrees, goal mode, or waits the user never requested.
- Detailed combination rules are enforced by the shared control service and
  returned as actionable usage errors only after an invalid call. Per-action
  examples and a repeated per-action parameter schema are intentionally omitted.

## Security invariants

- The callback accepts loopback requests only and requires the current
  per-child bearer token using a timing-safe comparison.
- The token is never persisted, logged, returned to the UI, or written into
  the materialized plugin.
- Inputs map to a fixed action and parameter allowlist. There is no arbitrary
  CLI, shell, route, or URL forwarding.
- Session/worktree deletion and project-path registration are not exposed.
- An aborted tool request propagates an abort signal into the shared service.

## Result contract

Every completed call returns JSON:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "action": "session.create",
  "data": {}
}
```

Command and operational failures use the same envelope with `ok: false` and
an `error` object. OpenCode-level cancellation can still produce a native tool
error state.

## Runtime parity

- Web and Desktop managed OpenCode: injected automatically.
- External OpenCode selected with `OPENCODE_HOST` or skip-start: not injected,
  because OpenDeputy does not control that process environment.
- VS Code: not injected; the extension owns a separate OpenCode lifecycle.
- Hosted and Capacitor mobile clients use the server's managed OpenCode tool
  when connected to such a server; no tool runs in the client runtime.
