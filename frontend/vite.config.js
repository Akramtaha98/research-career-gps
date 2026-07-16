import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // Vitest reads this same config (`vitest run`) rather than needing a
  // separate vitest.config.js -- see src/setupTests.js for the jest-dom
  // matcher setup this `setupFiles` entry wires in.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
  },
});
