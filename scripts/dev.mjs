import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const projectRoot = path.resolve();

async function setupDevPublic() {
  console.log('[Dev Setup] Setting up public_dev directory...');
  const publicDevDir = path.join(projectRoot, 'public_dev');

  await fs.rm(publicDevDir, { recursive: true, force: true });
  await fs.mkdir(publicDevDir, { recursive: true });

  try {
    // Relative symlinks from public_dev/ to public/
    await fs.symlink('../public/favicon.ico', path.join(publicDevDir, 'favicon.ico'));
    await fs.symlink('../public/CNAME', path.join(publicDevDir, 'CNAME'));
    // On Windows, symlink type 'junction' is used for directories.
    await fs.symlink('../public/img', path.join(publicDevDir, 'img'), 'junction');
    // Imported by components/CommunityMapDemo.vue.
    await fs.mkdir(path.join(publicDevDir, 'community-map'));
    await fs.symlink(
      '../../public/community-map/illustration.jpg',
      path.join(publicDevDir, 'community-map', 'illustration.jpg'),
    );
    console.log('[Dev Setup] Symlinks created successfully.');
  } catch (err) {
    console.error('[Dev Setup] Error creating symlinks:', err);
    process.exit(1);
  }
}

async function main() {
  await setupDevPublic();

  console.log('[Dev] Starting Nuxt dev server...');

  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const nodeOptions = existingNodeOptions.includes('--max-old-space-size')
    ? existingNodeOptions
    : `${existingNodeOptions} --max-old-space-size=8192`.trim();

  const nuxtBin = path.join(projectRoot, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');
  const nuxtDev = spawn(process.execPath, [nuxtBin, 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  });

  const forwardSignal = (signal) => {
    if (!nuxtDev.killed) {
      nuxtDev.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  nuxtDev.on('error', (err) => {
    console.error('[Nuxt Dev] Failed to start:', err);
    process.exit(1);
  });

  nuxtDev.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
