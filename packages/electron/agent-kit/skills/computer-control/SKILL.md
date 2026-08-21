---
name: computer-control
description: Safely operate real Chrome tabs and Windows applications using Open Browser Use, Open Computer Use, Playwright, native accessibility trees, local visual-region detection, screenshots, mouse, and keyboard tools. Use for browsing, clicking, typing, menus, dialogs, cross-app workflows, visual-only interfaces, or any task that controls the computer.
---

# Computer control

Use this order; do not start with coordinate guessing:

1. Prefer direct integrations and filesystem tools. For the user's real Chrome profile, follow `$open-browser-use`: list user tabs, claim a matching tab or open a task tab, use page/CDP actions, and finalize the task tabs. For isolated or DOM-first web automation, use Playwright.
2. For Windows apps, follow `$open-computer-use`: call `open_computer_use_list_apps`, inspect the target with `open_computer_use_get_app_state`, and use the returned element index for semantic actions.
3. Target one explicit app/window. Prefer `set_value` and element-targeted actions. Never reuse an element index after a major UI change without inspecting again.
4. If Open Computer Use cannot expose the target, inspect with `computer_use_get_ui_tree` or `computer_use_find_element`. Microsoft `winapp ui inspect/search/invoke` remains available through the terminal. Touchpoint stays installed but disabled for troubleshooting.
5. If structured inspection still fails, call `visual_grounding_locate_target`. It rejects blank frames and uses local OCR plus OmniParser first; Muse Spark labels numbered regions only when local matching is insufficient.
6. Treat visual coordinates as short-lived. Confirm the window, bounds, label, and current screenshot before physical input. If the match is ambiguous, inspect again or ask the user.
7. Before the first mouse, keyboard, or app-changing desktop action, call `agent_overlay_show`. Hide it with `agent_overlay_hide` when the task ends or is interrupted.
8. Verify every state change with Open Browser Use, Playwright, an accessibility-tree query, or a fresh screenshot. Never assume an action worked.
9. Never inspect password managers or unrelated private tabs. Require explicit confirmation before sending, submitting, deleting, purchasing, uploading, installing, or overwriting.
