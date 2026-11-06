import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发端口只在 tauri.conf.json 的 build.devUrl 定义，避免 Vite 与 Tauri 各写一份。
const tauriConf = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { build: { devUrl: string } };
const devUrl = new URL(tauriConf.build.devUrl);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: devUrl.hostname,
    port: Number(devUrl.port || (devUrl.protocol === 'https:' ? 443 : 80)),
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
