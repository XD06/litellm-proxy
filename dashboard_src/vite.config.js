import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../dashboard',
    emptyOutDir: false,
    minify: false, // Don't empty because index.html is there!
    rollupOptions: {
      input: resolve(__dirname, 'src/main.js'),
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) return 'styles.css';
          return '[name][extname]';
        },
        chunkFileNames: '[name].js',
      }
    }
  }
});
