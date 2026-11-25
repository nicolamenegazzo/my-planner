import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In sviluppo: `npm run dev` su :5173 inoltra /api al backend Spring su :8080.
// In build: l'output finisce tra le risorse statiche servite da Spring Boot.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    outDir: '../../../target/classes/static',
    emptyOutDir: true,
  },
});
