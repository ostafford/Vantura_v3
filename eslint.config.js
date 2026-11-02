import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'Reference_Docs',
      'coverage',
      'playwright-report',
      'test-results',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // docs/adr/0021: only the Regulars module reads or writes Regulars. Any
    // other file that touches `upcoming_charges` must be allowlisted here, with
    // a reason that isn't "I need projected dates" (add a module query instead).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/services/regulars/**',
      // Schema DDL and migrations.
      'src/db/schema.ts',
      // Demo data seeds and clears the table directly.
      'src/db/seedDemoData.ts',
      // Bucket membership (bucket_id), not dates or amounts.
      'src/services/budgetBuckets.ts',
      // Payment-link existence checks (docs/adr/0020).
      'src/services/fundingSource.ts',
      'src/services/recurringChargeDetection.ts',
      // Profile export/import writes the stored rows verbatim (docs/adr/0013).
      'src/services/profileExport.ts',
      // Test fixtures seed the table.
      'src/**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/upcoming_charges/]',
          message:
            'Read and write Regulars through @/services/regulars, not the upcoming_charges table (docs/adr/0021).',
        },
        {
          selector: 'TemplateElement[value.raw=/upcoming_charges/]',
          message:
            'Read and write Regulars through @/services/regulars, not the upcoming_charges table (docs/adr/0021).',
        },
      ],
    },
  }
)
