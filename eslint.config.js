export default [
  {
    // Phaser is vendored upstream code; linting it reports thousands of
    // findings that are not ours to fix.
    // reference/ is a gitignored local mirror of the ROM research repos this
    // project cites. It is someone else's code, read for its data tables.
    ignores: ['lib/**', 'node_modules/**', 'docs/**', 'reference/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        Phaser: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The dev server runs on Node, not in the browser.
    files: ['tools/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
  },
];
