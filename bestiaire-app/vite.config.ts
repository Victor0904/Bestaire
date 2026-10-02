/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : l'application fonctionne dans n'importe quel dossier de l'hébergement (Hostinger)
export default defineConfig({
  base: './', plugins: [react()], build: { chunkSizeWarningLimit: 900 },
  test: { include: ['src/**/*.test.ts'] },
});
