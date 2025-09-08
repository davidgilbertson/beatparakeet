import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 8081,
    strictPort: true,
  },
  preview: {
    port: 8081,
    strictPort: true,
  },
});
