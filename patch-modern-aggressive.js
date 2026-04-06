const fs = require('fs');
const files = [
  'packages/ui/src/profile/web/profile-shell-web.component.ts',
  'packages/ui/src/profile/profile-shell.component.ts',
  'packages/ui/src/team-profile/web/team-profile-shell-web.component.ts',
];

const newDesktopCSS = `
      .stage-modern-base {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--m-accent) 15%, rgba(10, 10, 12, 0.2)) 0%,
            rgba(10, 10, 12, 0.05) 25%,
            transparent 60%
          ),
          linear-gradient(
            125deg,
            transparent 36%,
            color-mix(in srgb, var(--m-accent) 6%, transparent) 36.2%,
            color-mix(in srgb, var(--m-accent) 2%, transparent) 74%,
            transparent 74.2%
          );
        opacity: 0.95;
      }

      .stage-modern-lanes {
        position: absolute;
        inset: -15% -10% -10% 15%;
        background: repeating-linear-gradient(
          -45deg,
          transparent 0 32px,
          color-mix(in srgb, var(--m-accent) 28%, transparent) 32px 42px,
          color-mix(in srgb, var(--m-accent) 14%, transparent) 42px 46px,
          transparent 46px 56px,
          color-mix(in srgb, var(--m-accent) 8%, transparent) 56px 58px
        );
        clip-path: polygon(24% 0%, 100% 0%, 100% 100%, 0% 100%);
        mask-image: linear-gradient(
          to left,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.85) 35%,
          rgba(0, 0, 0, 0.25) 75%,
          transparent 100%
        );
        -webkit-mask-image: linear-gradient(
          to left,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.85) 35%,
          rgba(0, 0, 0, 0.25) 75%,
          transparent 100%
        );
        opacity: 0.95;
        transform: skewX(-22deg);
        transform-origin: right bottom;
      }

      .stage-modern-glow {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(
            circle at 86% 10%,
            color-mix(in srgb, var(--m-accent) 28%, transparent) 0%,
            color-mix(in srgb, var(--m-accent) 12%, transparent) 25%,
            transparent 65%
          ),
          linear-gradient(
            110deg,
            transparent 56%,
            color-mix(in srgb, var(--m-accent) 14%, transparent) 56.2%,
            color-mix(in srgb, var(--m-accent) 6%, transparent) 64%,
            transparent 64.2%
          );
        opacity: 0.98;
      }
`;

const newMobileCSS = `
        .stage-modern-base {
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--m-accent) 18%, rgba(10, 10, 12, 0.2)) 0%,
              transparent 45%
            ),
            linear-gradient(
              135deg,
              transparent 0%,
              color-mix(in srgb, var(--m-accent) 10%, transparent) 64%,
              transparent 100%
            );
        }
        .stage-modern-lanes {
          inset: -10% -28% 40% -8%;
          clip-path: polygon(0% 0%, 100% 0%, 82% 100%, 0% 100%);
          transform: none;
          background: repeating-linear-gradient(
            -50deg,
            transparent 0 24px,
            color-mix(in srgb, var(--m-accent) 26%, transparent) 24px 30px,
            color-mix(in srgb, var(--m-accent) 12%, transparent) 30px 34px,
            transparent 34px 44px,
            color-mix(in srgb, var(--m-accent) 6%, transparent) 44px 46px
          );
          mask-image: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.96) 0%,
            rgba(0, 0, 0, 0.72) 44%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.96) 0%,
            rgba(0, 0, 0, 0.72) 44%,
            transparent 100%
          );
          opacity: 0.9;
        }
        .stage-modern-glow {
          background:
            radial-gradient(
              circle at 50% 0%,
              color-mix(in srgb, var(--m-accent) 26%, transparent) 0%,
              color-mix(in srgb, var(--m-accent) 12%, transparent) 30%,
              transparent 76%
            ),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--m-accent) 5%, transparent) 0%,
              transparent 42%
            );
        }
`;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf-8');

  if (file.includes('profile-shell.component.ts')) {
    // Mobile replacement pattern
    content = content.replace(
      /\s*\.stage-modern-base \{\s*background:[\s\S]*?(?=\s*\.stage-modern-vignette)/,
      '\n' + newMobileCSS
    );
  } else {
    // Desktop replacement pattern
    content = content.replace(
      /\s*\.stage-modern-base \{\s*position: absolute;\s*inset: 0;\s*background:[\s\S]*?(?=\s*\.stage-modern-vignette)/,
      '\n' + newDesktopCSS
    );
  }

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}

// Note: Patched typescript.js referencedFiles bounds check to gracefully ignore rather than throw DEBUG error.
