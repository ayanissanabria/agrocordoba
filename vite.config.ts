import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/auth': 'http://127.0.0.1:5000',
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías en archivos separados: el navegador las guarda en caché
        manualChunks: {
          mapa: ['leaflet', 'react-leaflet'],
          iconos: ['lucide-react'],
        },
      },
    },
  },
});
