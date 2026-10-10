import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['eslint', 'react', 'typescript'],
  ignorePatterns: ['dist', 'src/routeTree.gen.ts'],
  categories: {
    correctness: 'error',
  },
  rules: {
    'no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    'typescript/no-explicit-any': 'off',
    'typescript/consistent-type-imports': [
      'error',
      {
        fixStyle: 'inline-type-imports',
        prefer: 'type-imports',
      },
    ],
    'no-shadow': 'off',
    'typescript/no-shadow': 'error',
    'no-empty': [
      'error',
      {
        allowEmptyCatch: true,
      },
    ],
    'react/exhaustive-deps': 'error',
    'react/rules-of-hooks': 'error',
    'react/only-export-components': 'off',
  },
  env: {
    browser: true,
    es2020: true,
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      env: {
        vitest: true,
      },
    },
  ],
})
