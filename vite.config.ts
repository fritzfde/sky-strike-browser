import { defineConfig } from 'vite';
export default defineConfig({ base: process.env.BASE ?? '/sky-strike-browser/', build: { target: 'es2020', chunkSizeWarningLimit: 4000, rollupOptions: { output: { inlineDynamicImports: true } } } });
