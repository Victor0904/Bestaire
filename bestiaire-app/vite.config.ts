/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Connexion anticipée au serveur Supabase (gagne ~100 ms au premier appel sur mobile)
const preconnect = (): Plugin => ({ name: 'preconnect-supabase', transformIndexHtml: () => {
  const url = process.env.VITE_SUPABASE_URL; if (!url || !/^https?:\/\//.test(url)) return [];
  return [{ tag: 'link', attrs: { rel: 'preconnect', href: new URL(url).origin, crossorigin: '' }, injectTo: 'head' }];
} });

// base './' : l'application fonctionne dans n'importe quel dossier de l'hébergement (Hostinger)
export default defineConfig({
  base: './', plugins: [react(), preconnect()],
  build: {
    chunkSizeWarningLimit: 900,
    // bibliothèques et données dans des fichiers séparés : gardés en cache d'une mise à jour à l'autre
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('node_modules/react')) return 'react';
      if (id.includes('node_modules/@supabase')) return 'supabase';
      if (id.endsWith('species.json')) return 'especes';
    } } },
  },
  test: { include: ['src/**/*.test.ts'] },
});
