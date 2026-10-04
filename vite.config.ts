import { defineConfig } from 'vite';

// 公開先のサブパスが決まっていないため、相対パス (base: './') で出力する。
// どのパス配下に置いても動く。
export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
