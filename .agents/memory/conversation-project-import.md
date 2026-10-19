---
name: Conversation-to-project imports
description: Replit may preserve files from a moved conversation separately from the active project root.
---

After a conversation moves into a project, expected source files may be preserved outside the active project root instead of being installed there. Check the preserved conversation files before recreating the app or its artifacts. When restoring files, retain Replit-managed artifact manifests and exclude generated dependencies and local environment folders.

**Why:** The conversation handoff retained the imported application source separately while the active project initially contained only its starter files.

**How to apply:** If the project looks like a fresh scaffold immediately after a handoff, locate the preserved files and restore them before creating replacements.
