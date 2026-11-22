# Refactor brief: R5-modes

Owned: every tracked file under `theia/extensions/modes/`.

Notes:

- The large files are `organising-widget.ts` (2,422 lines), `setups-service.ts` (1,484),
  `group-model.ts` (1,275), `mode-service.ts` (866) and `modes.css` (929).
- `group-model.ts` is the tab group model that other extensions read. Its exported names and the
  shape of what it persists stay as they are: a stored setup written by the base must load
  unchanged after your work.
- Nothing here may weld Theia to full-window presentation (project rule 3, the bridge):
  `main-area-exemption.ts` and the mode switch are part of that boundary. Simplify inside them;
  do not change what they exempt or when.
- Look for: model change events that fire more than once per mutation, listeners on the model that
  widgets add and never dispose, full re-renders of the organising view for a one-row change,
  persistence writes per event that could be coalesced without changing what is finally written,
  and O(n^2) scans over groups and tabs.
- `modes.css`: a rule is dead only when no class, id or attribute in the whole tree can match it
  (`git grep` across `theia/`, `orca-overlay/` and `scripts/`). Do not rename a class.
