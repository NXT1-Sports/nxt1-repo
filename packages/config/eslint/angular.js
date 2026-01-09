/**
 * ESLint configuration for Angular packages
 * @type {import('eslint').Linter.FlatConfig[]}
 */
const baseConfig = require('./base');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // Angular-specific rules
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/member-ordering': [
        'warn',
        {
          default: [
            'static-field',
            'instance-field',
            'constructor',
            'static-method',
            'instance-method',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.component.ts'],
    rules: {
      // Component-specific rules
    },
  },
  {
    files: ['**/*.service.ts'],
    rules: {
      // Service-specific rules
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
