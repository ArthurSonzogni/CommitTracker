import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const projectRoot = path.resolve();

async function setupDevPublic() {
  console.log('[Dev Setup] Setting up public_dev directory...');
  const publicDevDir = path.join(projectRoot, 'public_dev');
  
  await fs.rm(publicDevDir, { recursive: true, force: true });
  await fs.mkdir(publicDevDir, { recursive: true });

  // Create symlinks
  try {
    // Relative symlinks from public_dev/ to public/
    await fs.symlink('../public/favicon.ico', path.join(publicDevDir, 'favicon.ico'));
    await fs.symlink('../public/CNAME', path.join(publicDevDir, 'CNAME'));
    // On Windows, symlink type 'dir' is important
    await fs.symlink('../public/img', path.join(publicDevDir, 'img'), 'junction');
    console.log('[Dev Setup] Symlinks created successfully.');
  } catch (err) {
    console.error('[Dev Setup] Error creating symlinks:', err);
    process.exit(1);
  }
}

async function main() {
  await setupDevPublic();

  console.log('[Dev] Starting servers...');

  // Start data server
  const dataServer = spawn('node', ['scripts/data-server.mjs'], {
    stdio: 'inherit',
    shell: true
  });

  // Start Nuxt dev server directly with node to avoid npx shell wrapper spam
  const nuxtDev = spawn('node', ['node_modules/nuxt/bin/nuxt.mjs', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=8192'
    }
  });

  // Handle exit
  const cleanup = () => {
    console.log('[Dev] Cleaning up processes...');
    try {
      dataServer.kill();
    } catch (e) {}
    try {
      nuxtDev.kill();
    } catch (e) {}
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  dataServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[Data Server] Exited with code ${code}`);
    }
    cleanup();
    process.exit(code || 0);
  });

  nuxtDev.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[Nuxt Dev] Exited with code ${code}`);
    }
    cleanup();
    process.exit(code || 0);
  });
}

main();
