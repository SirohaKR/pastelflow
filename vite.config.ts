import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://localhost:5210';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: { '/api': api, '/uploads': api },
  },
});
