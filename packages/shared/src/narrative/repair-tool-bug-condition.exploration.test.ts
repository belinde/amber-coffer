import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * Bug Condition Exploration Test — Repair Tool Timing Destruction
 *
 * **Validates: Requirements 1.1, 2.1**
 *
 * This test encodes the EXPECTED behavior: the one-off repair tool
 * `tools/fix-session-recording-once.mjs` should NOT exist in the repository.
 *
 * On UNFIXED code this test FAILS — confirming the bug condition is active
 * (dead code that destroys per-chunk timing if mistakenly re-run).
 *
 * After the fix (file deletion), this test PASSES — confirming the bug is resolved.
 *
 * The repair tool's consolidation logic collapses multi-chunk manifests:
 * - Given User A with chunks at offsets [0, 120000, 240000], after consolidation
 *   only offset 0 survives (120000 and 240000 are destroyed).
 * - Given User B joining late with chunks at offsets [300000, 360000], after
 *   consolidation only offset 300000 survives (360000 is destroyed).
 */
describe('Bug Condition: Repair Tool Timing Destruction', () => {
  // Resolve the path to the repair tool relative to the repository root
  const repoRoot = resolve(import.meta.dirname, '../../../../');
  const repairToolPath = resolve(repoRoot, 'tools/fix-session-recording-once.mjs');

  it('property: repair tool must not exist in the repository (dead code risk)', () => {
    fc.assert(
      fc.property(
        // Generate multi-chunk manifests demonstrating the timing destruction scenario
        fc.record({
          userCount: fc.integer({ min: 1, max: 5 }),
          chunksPerUser: fc.integer({ min: 2, max: 10 }),
          baseOffsetMs: fc.integer({ min: 0, max: 7_200_000 }),
          chunkDurationMs: fc.integer({ min: 30_000, max: 120_000 }),
        }),
        ({ userCount, chunksPerUser, baseOffsetMs, chunkDurationMs }) => {
          // For any multi-chunk manifest configuration, the repair tool must not exist.
          // If it exists, it could be mistakenly run and would consolidate N chunks
          // per user into 1, destroying offsets for chunks 2..N.
          //
          // Example: User A with chunks at offsets [0, 120000, 240000]
          //   After consolidation → only 1 chunk at offset 0 (120000, 240000 lost)
          //
          // Example: User B joining late at offsets [300000, 360000]
          //   After consolidation → only 1 chunk at offset 300000 (360000 lost)
          //
          // The number of destroyed offsets per user = chunksPerUser - 1
          // Total destroyed offsets = userCount * (chunksPerUser - 1)
          const destroyedOffsetsPerUser = chunksPerUser - 1;
          const totalDestroyedOffsets = userCount * destroyedOffsetsPerUser;

          // This assertion encodes the expected behavior:
          // The repair tool must NOT exist — its presence is the bug condition
          expect(
            existsSync(repairToolPath),
            `Repair tool exists at ${repairToolPath}. ` +
              `For a manifest with ${userCount} user(s) × ${chunksPerUser} chunks ` +
              `(base offset ${baseOffsetMs}ms, duration ${chunkDurationMs}ms), ` +
              `running this tool would destroy ${totalDestroyedOffsets} offset(s) ` +
              `(${destroyedOffsetsPerUser} per user). ` +
              `The tool consolidates all chunks into 1 track per user, ` +
              `preserving only the earliest sessionOffsetMs.`,
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
