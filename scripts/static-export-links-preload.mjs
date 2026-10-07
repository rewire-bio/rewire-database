import path from 'node:path';
import { installStaticExportLinks } from './static-export-links.mjs';

// Node workers inherit --import. Only the Next build parent performs the final
// export; leave prerender workers and every other process unmodified.
const root = process.cwd();
if (process.argv[2] === 'build' && process.argv[1] &&
    path.resolve(process.argv[1]) === path.join(root, 'node_modules/next/dist/bin/next')) {
  const state = installStaticExportLinks(root);
  process.on('exit', code => {
    if (code === 0 && !state.linked) {
      console.error('Static export completed without any verified page links.');
      process.exitCode = 1;
    } else console.log(`Static export linked ${state.linked} finished page files (${state.bytes} bytes), without duplicate allocation.`);
  });
}
