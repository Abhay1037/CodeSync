import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently hopping ports (which would break CORS).
    strictPort: true,
  },
});
