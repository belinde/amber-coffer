/**
 * Single ESLint entrypoint for the monorepo.
 * When adding a pnpm workspace: update reactFiles/nodeFiles below AND the workspace
 * package.json "lint" script. See .cursor/rules/15-eslint-monorepo.mdc
 */
import base from '@amber/eslint-config';
import { nodeOverlays } from '@amber/eslint-config/node';
import { reactOverlays } from '@amber/eslint-config/react';
import tseslint from 'typescript-eslint';

const reactFiles = [
  'apps/master-app/**/*.{ts,tsx}',
  'apps/player-activity/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
];

const nodeFiles = [
  'apps/discord-bot/**/*.{ts,tsx,js,mjs}',
  'packages/shared/**/*.{ts,tsx}',
  'packages/tabletop-engine/**/*.{ts,tsx}',
  'packages/eslint-config/**/*.js',
  'infrastructure/**/*.{ts,js}',
  'tools/migrate-from-poc/**/*.{ts,tsx}',
  'tools/build-public-canon/**/*.{ts,tsx}',
];

/** Paths linted without typescript-eslint project service (still get import/order, etc.). */
const typeCheckExcludedFiles = [
  'packages/eslint-config/**/*.js',
  '**/vitest.config.ts',
  '**/vite.config.ts',
  'apps/discord-bot/test/**/*.{ts,tsx}',
  'infrastructure/lambdas/**/*.test.ts',
];

/** @param {import('eslint').Linter.Config[]} blocks */
function withFiles(blocks, files) {
  return blocks.map((block) => ({ ...block, files }));
}

export default tseslint.config(
  ...base,
  ...withFiles(reactOverlays, reactFiles),
  ...withFiles(nodeOverlays, nodeFiles),
  {
    files: typeCheckExcludedFiles,
    extends: [tseslint.configs.disableTypeChecked],
  },
);
