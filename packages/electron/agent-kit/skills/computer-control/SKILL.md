---
name: computer-control
description: Safely operate every OpenDeputy right-panel surface and tab, route unqualified browser requests to its in-app Browser, use real Chrome only when explicitly requested, and control Windows applications. Use for right-panel access, browsing, clicking, typing, menus, dialogs, cross-app workflows, visual-only interfaces, or any task that controls the computer.
---

# Computer control

Use this order; do not start with coordinate guessing:

1. Treat an unqualified request to open, show, use, inspect, edit, or work with Context, Git, PR/Pull Request, Changes/Diff, Walkthrough, Files/Editor, Terminal, Project Notes, Plan, Browser, Chat, or a right-panel tab as an OpenDeputy request in every language. Manage it with `opendeputy_panel`: use `panel.open` to show or focus a surface, `panel.list` first when exact tabs matter, then pass its `tabId` to `panel.activate` or `panel.closeTab`. Use `panel.newBrowserTab`, `panel.close`, and `panel.setExpanded` for those exact intents.
2. Keep right-panel control internal. Never use desktop mouse/keyboard control, visual coordinates, `Ctrl+W`, `Alt+F4`, or a window-close command to open, activate, resize, or close an OpenDeputy panel/tab; those inputs can target and close the whole application.
3. Treat an unqualified request to open a browser, page, website, or URL as an OpenDeputy panel request. Call `opendeputy_web` with `browser.open`; it creates or reuses and focuses the Browser tab in the right context panel. Use its snapshot/click/type/scroll actions for content inside that page.
4. For a request that explicitly asks for an external/system/desktop browser or names Chrome, Firefox, Edge, Safari, Brave, Opera, Open Browser Use, Playwright, a browser profile or extension, or CDP, follow `$open-browser-use`: list user tabs, claim a matching tab or open a task tab, use page/CDP actions, and finalize the task tabs. The managed routing guard keeps external browser and desktop-control tools unavailable to unqualified browser requests.
5. Do the work through the surface's native data path, then show the matching internal surface: file/read/edit tools for Files and Changes; shell plus Git/GitHub tools for Terminal, Git, and PR; plan/session/context tools for Plan, Chat, and Context; and the current changes, branch, or PR data for Walkthrough. Project Notes stay in OpenDeputy's Notes surface; use a notes integration if one is available, and never simulate typing into OpenDeputy's Notes UI.
6. Use an external application when the user explicitly names one, asks for an external/system/desktop app, or requests work for which OpenDeputy has no built-in surface or direct data tool. Do not silently replace a supported internal surface with VS Code, Windows Terminal, File Explorer, GitHub Desktop, Notepad, or another desktop app.
7. For Windows apps, follow `$open-computer-use`: call `open_computer_use_list_apps`, inspect the target with `open_computer_use_get_app_state`, and use the returned element index for semantic actions.
8. Target one explicit app/window. Prefer `set_value` and element-targeted actions. Never reuse an element index after a major UI change without inspecting again.
9. If Open Computer Use cannot expose the target, inspect with `computer_use_get_ui_tree` or `computer_use_find_element`. Microsoft `winapp ui inspect/search/invoke` remains available through the terminal. Touchpoint stays installed but disabled for troubleshooting.
10. If structured inspection still fails, call `visual_grounding_locate_target`. It rejects blank frames and uses local OCR plus OmniParser first; Muse Spark labels numbered regions only when local matching is insufficient.
11. Treat visual coordinates as short-lived. Confirm the window, bounds, label, and current screenshot before physical input. If the match is ambiguous, inspect again or ask the user.
12. Before the first mouse, keyboard, or app-changing desktop action, call `agent_overlay_show`. Hide it with `agent_overlay_hide` when the task ends or is interrupted.
13. Verify every state change with the returned panel state, the in-app browser, Open Browser Use, Playwright, an accessibility-tree query, or a fresh screenshot. Never assume an action worked.
14. Never inspect password managers or unrelated private tabs. Require explicit confirmation before sending, submitting, deleting, purchasing, uploading, installing, or overwriting.
