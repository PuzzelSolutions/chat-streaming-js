import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'pzl-stream-lib': 'src/PzlStream.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    minify: true,
    external: ['@microsoft/signalr'],
    outExtension: () => ({ js: '.mjs' }),
  },
  {
    entry: { 'pzl-stream-lib': 'src/PzlStream.ts' },
    format: ['cjs'],
    sourcemap: true,
    minify: true,
    external: ['@microsoft/signalr'],
    outExtension: () => ({ js: '.cjs' }),
  },
  {
    entry: { 'pzl-stream-lib': 'src/PzlStream.ts' },
    format: ['esm'],
    sourcemap: true,
    minify: false,
    external: ['@microsoft/signalr'],
    outExtension: () => ({ js: '.js' }),
  },
]);
