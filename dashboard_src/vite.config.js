import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'path';

const sourceStyles = resolve(__dirname, 'src/styles.css');
const outputStyles = resolve(__dirname, '../dashboard/styles.css');

export default defineConfig({
  plugins: [
    {
      name: 'copy-dashboard-styles',
      writeBundle() {
        copyFileSync(sourceStyles, outputStyles);
      },
    },
  ],
  build: {
    outDir: '../dashboard',
    emptyOutDir: false,
    minify: false, // Don't empty because index.html is there!
    rollupOptions: {
      input: resolve(__dirname, 'src/main.js'),
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
        chunkFileNames: '[name].js',
      }
    }
  }
});
