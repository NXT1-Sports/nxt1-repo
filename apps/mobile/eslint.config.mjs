// @ts-check
import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    // Additional Ionic/Angular-specific rules can go here
    files: ['src/**/*.ts'],
    rules: {
      // Ionic specific relaxations
    },
  },
];
