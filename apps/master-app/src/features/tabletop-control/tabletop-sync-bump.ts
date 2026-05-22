/** Invalidates the cached snapshot hash so the next sync poll publishes immediately. */
let bumpSnapshot: (() => void) | null = null;

export function registerTabletopSnapshotBump(fn: () => void): () => void {
  bumpSnapshot = fn;
  return () => {
    if (bumpSnapshot === fn) {
      bumpSnapshot = null;
    }
  };
}

export function bumpTabletopSnapshot(): void {
  bumpSnapshot?.();
}
