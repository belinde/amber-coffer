import globals from 'globals';

/** Node overlay blocks (paths are set by the root eslint.config.js). */
export const nodeOverlays = [
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
