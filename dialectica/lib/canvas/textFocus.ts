// Module-level pending-focus tracker for newly placed textboxes.
// When this client places a textbox via onPaneClick, we mark its id here so the
// corresponding StrokeNode auto-enters edit mode on mount. Remote clients who
// receive the same Realtime insert will NOT have the id set here, so they don't
// steal focus from whoever just placed it.

let pendingId: string | null = null;

export function setPendingTextFocus(id: string) {
  pendingId = id;
}

/** Returns true if `id` is the pending textbox. Does NOT clear — call clearPendingTextFocus() after focus is confirmed. */
export function hasPendingTextFocus(id: string): boolean {
  return pendingId === id;
}

export function clearPendingTextFocus() {
  pendingId = null;
}
