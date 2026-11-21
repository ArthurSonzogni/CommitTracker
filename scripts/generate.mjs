// Production static build wrapper.
//
// `public/` holds ~150k static data JSON files that Nuxt/Nitro would otherwise
// walk and copy one by one into `.output/public/` during `nuxt generate`.
// Instead, we point Nuxt's `dir.public` at a lightweight `public_gen/` dir
// containing only the small committed assets, leaving `public/` untouched so
// compile-time imports like `../public/data/repositories.json` still resolve.
// After `nuxt generate`, we move (in CI, MOVE_PUBLIC_DATA=1) or hardlink/copy
// the heavy data directories into `.output/public/`, preserving any route
// `index.html` files that share a directory name (e.g. `treemap/`, `cve/`).

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve();
const publicDir = path.join(projectRoot, 'public');
const lightPublicDir = path.join(projectRoot, 'public_gen');
const outputDir = path.join(projectRoot, '.output', 'public');
const moveMode = process.env.MOVE_PUBLIC_DATA === '1';

const DATA_ENTRIES = new Set([
  'accretion',
  'badges',
  'badges.json',
  'commit_rates',
  'community-map',
  'cve',
  'data',
  'data_updated.json',
  'fuzz-test',
  'treemap',
]);

function moveInto(src, dst) {
  if (!fs.existsSync(dst)) {
    fs.renameSync(src, dst);
    return;
  }
  if (fs.statSync(src).isDirectory() && fs.statSync(dst).isDirectory()) {
    for (const entry of fs.readdirSync(src)) {
      moveInto(path.join(src, entry), path.join(dst, entry));
    }
    fs.rmdirSync(src);
  } else {
    fs.rmSync(dst, { recursive: true, force: true });
    fs.renameSync(src, dst);
  }
}

function linkOrCopyInto(src, dst) {
  if (!fs.existsSync(dst)) {
    const res = spawnSync('cp', ['-al', src, dst], { stdio: 'ignore' });
    if (res.status !== 0) {
      fs.cpSync(src, dst, { recursive: true });
    }
    return;
  }
  if (fs.statSync(src).isDirectory() && fs.statSync(dst).isDirectory()) {
    for (const entry of fs.readdirSync(src)) {
      linkOrCopyInto(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.rmSync(dst, { recursive: true, force: true });
    const res = spawnSync('cp', ['-al', src, dst], { stdio: 'ignore' });
    if (res.status !== 0) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

function runOrExit(cmd, args, env) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

fs.rmSync(lightPublicDir, { recursive: true, force: true });
fs.mkdirSync(lightPublicDir, { recursive: true });

try {
  // Populate public_gen/ with the small committed assets (everything outside DATA_ENTRIES).
  for (const entry of fs.readdirSync(publicDir)) {
    if (DATA_ENTRIES.has(entry)) continue;
    linkOrCopyInto(path.join(publicDir, entry), path.join(lightPublicDir, entry));
  }

  // Referenced by components/HomeBento.vue during build.
  const illustrationSrc = path.join(publicDir, 'community-map', 'illustration.jpg');
  if (fs.existsSync(illustrationSrc)) {
    fs.mkdirSync(path.join(lightPublicDir, 'community-map'), { recursive: true });
    fs.copyFileSync(illustrationSrc, path.join(lightPublicDir, 'community-map', 'illustration.jpg'));
  }

  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const nodeOptions = existingNodeOptions.includes('--max-old-space-size')
    ? existingNodeOptions
    : `${existingNodeOptions} --max-old-space-size=8192`.trim();
  const buildEnv = {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    NUXT_PUBLIC_DIR: 'public_gen',
  };

  const nuxtBin = path.join(projectRoot, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');
  runOrExit(process.execPath, [nuxtBin, 'generate'], buildEnv);

  for (const name of DATA_ENTRIES) {
    const src = path.join(publicDir, name);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(outputDir, name);
    if (moveMode) {
      moveInto(src, dst);
    } else {
      linkOrCopyInto(src, dst);
    }
  }

  const dataDir = moveMode ? path.join(outputDir, 'data') : path.join(publicDir, 'data');
  runOrExit(process.execPath, [path.join(projectRoot, 'scripts', 'static-meta.mjs'), outputDir, dataDir], process.env);
} finally {
  fs.rmSync(lightPublicDir, { recursive: true, force: true });
}
