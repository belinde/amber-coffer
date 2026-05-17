/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'master-app',
        'player-activity',
        'shared',
        'infrastructure',
        'docs',
        'deps',
        'ci',
        'root',
      ],
    ],
  },
};
