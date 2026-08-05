const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('--- 1. Building Vite Production Assets ---');
  execSync('npx vite build', { stdio: 'inherit' });

  console.log('--- 2. Packaging Electron App ---');
  const projectDir = path.resolve(__dirname, '..');
  const targetDir = path.join(projectDir, 'dist_desktop_final');

  let success = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      try {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        }
      } catch (e) {
        console.warn('Cleanup warning:', e.message);
      }

      execSync('npx electron-builder --win portable', { stdio: 'inherit' });
      success = true;
      console.log('🎉 Electron build completed successfully!');
      break;
    } catch (err) {
      console.warn(`⚠️ Build attempt ${attempt} failed, retrying in 3 seconds...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!success) {
    console.error('❌ Build failed after 5 attempts.');
    process.exit(1);
  }
}

main();
