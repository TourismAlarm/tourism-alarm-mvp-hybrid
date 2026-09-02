import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Dos páginas independientes:
//   index.html   → el mapa público
//   revisar.html → la cola de revisión, detrás de login
//
// Separarlas evita que el código de revisión y el cliente de Supabase acaben
// en el bundle que descarga todo el mundo.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        revisar: resolve(__dirname, 'revisar.html')
      }
    }
  }
});
