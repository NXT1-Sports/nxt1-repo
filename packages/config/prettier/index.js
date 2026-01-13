/**
 * Shared Prettier configuration
 * @type {import('prettier').Config}
 */
module.exports = {
  // Print width
  printWidth: 100,

  // Indentation
  tabWidth: 2,
  useTabs: false,

  // Semicolons
  semi: true,

  // Quotes
  singleQuote: true,
  quoteProps: 'as-needed',
  jsxSingleQuote: false,

  // Trailing commas
  trailingComma: 'es5',

  // Brackets
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow functions
  arrowParens: 'always',

  // Line endings
  endOfLine: 'lf',

  // HTML/Angular
  htmlWhitespaceSensitivity: 'css',

  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',

  // Tailwind CSS class sorting
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['clsx', 'cn', 'cva'], // Custom class utilities if used
  tailwindAttributes: ['class', 'className', 'ngClass'], // Angular ngClass support

  // Overrides for specific file types
  overrides: [
    {
      files: '*.html',
      options: {
        printWidth: 120,
        singleQuote: false,
      },
    },
    {
      files: '*.scss',
      options: {
        singleQuote: false,
      },
    },
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 80,
        tabWidth: 2,
      },
    },
    {
      // Disable Tailwind plugin for config files to avoid theme.css lookup errors
      files: [
        '**/tailwind.config.{js,cjs,mjs,ts}',
        '**/tailwind.config.*.{js,cjs,mjs,ts}',
        '**/postcss.config.{js,cjs,mjs}',
      ],
      options: {
        plugins: [],
      },
    },
  ],
};
