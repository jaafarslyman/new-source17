---
name: Artifact-managed workflows
description: How to disable a workflow that is owned by an artifact.
---

Artifact-owned workflows cannot be removed directly with the workflow-removal function. Change the service declaration in the artifact metadata using the validated artifact replacement flow instead.

**Why:** The workflow manager rejected direct removal because the optional component-preview workflow was owned by its artifact.

**How to apply:** When a user asks to remove an artifact service, update its service definition through the artifact validation tool, then confirm the workflow list reflects the change.
