import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'coverage/**', 'target/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // One import statement per module.
      'no-duplicate-imports': 'error',
    },
  },
  {
    // The background is the only writer of the auth tokens. The popup reaches
    // the session through messages (lib/auth/client.ts) and may read the
    // stored login state (lib/auth/storage.ts); nothing else in lib/auth/.
    files: ['entrypoints/popup/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/auth/*', '!@/lib/auth/client', '!@/lib/auth/storage'],
              message: 'The popup must not touch the stored tokens. Use @/lib/auth/client.',
            },
            {
              group: ['@/lib/polling/poll'],
              message: 'Polling runs in the background. Ask for a poll with sendRequest.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
