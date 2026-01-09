module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Formatting, semicolons, etc.
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf',     // Performance improvement
        'test',     // Adding missing tests
        'build',    // Changes to build process
        'ci',       // CI configuration
        'chore',    // Other changes that don't modify src or test
        'revert',   // Reverts a previous commit
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'core',     // @nxt1/core package
        'web',      // Web app
        'mobile',   // Mobile app
        'backend',  // Backend API
        'functions',// Cloud Functions
        'config',   // @nxt1/config package
        'deps',     // Dependencies
        'release',  // Release commits
        '*',        // Allow other scopes
      ],
    ],
    'subject-case': [0], // Disable subject case checking
    'body-max-line-length': [0], // Disable line length in body
  },
};
