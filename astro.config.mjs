import { defineConfig } from 'astro/config';

// English 360° — static site generator config.
// Phase 1: pure SSG, no integrations. Output is plain HTML + minimal JS.
export default defineConfig({
  site: 'https://english360.example',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  compressHTML: true,
});
