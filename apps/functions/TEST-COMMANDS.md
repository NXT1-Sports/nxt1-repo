/\*\*

- Quick Test Commands Reference
-
- Unit Tests (Recommended - Fast)
- ================================ \*/

// Run all tests npm run test

// Run tests in watch mode npm run test -- --watch

// Run tests with UI dashboard npm run test:ui

// Run specific test file npm run test --
src/util/**tests**/checkUsernameAvailability.spec.ts

// Run with coverage npm run test:coverage

/\*\*

- Firebase Emulator (Integration - Full Stack)
- ============================================= \*/

// Start emulator for local testing npm run serve

// Emulator Dashboard: http://localhost:4000 // Functions:
http://localhost:5001/{project-id}/{region}/{function-name}

/\*\*

- Interactive Shell (Manual Testing)
- =================================== \*/

// Start Firebase functions shell npm run shell

// Inside shell, test a callable function: // > const result = await
checkUsernameAvailability({data: {username: 'newuser'}}) // >
console.log(result)

// Exit with Ctrl+C

/\*\*

- View Logs (Deployed Functions)
- =============================== \*/

npm run logs // Stream live logs from production

/\*\*

- Code Quality Checks
- =================== \*/

npm run typecheck // TypeScript type checking npm run lint // ESLint checking
npm run build // Compile to lib/

/\*\*

- Deployment
- ========== \*/

npm run deploy // Deploy to default project npm run deploy:staging // Deploy to
staging npm run deploy:prod // Deploy to production
