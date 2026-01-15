/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  tabWidth: 2,
  plugins: ['prettier-plugin-tailwindcss'],
  // Tell the Tailwind plugin where to find the config
  tailwindConfig: './tailwind.config.js',
  // Use the root node_modules for Tailwind
  tailwindStylesheet: './node_modules/tailwindcss/theme.css',
};
