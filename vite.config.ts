import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

const api = 'http://localhost:5210';

export default defineConfig({
  plugins: [react()],
  // 서버(server/realtime.js APP_VERSION)와 같은 버전인지 확인할 때 쓴다
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/uploads': api,
      '/collab': { target: api, ws: true },
      '/events': { target: api, ws: true },
    },
  },
});
