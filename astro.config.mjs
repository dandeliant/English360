import { defineConfig } from 'astro/config';
import adminApi from './src/integrations/admin-api.mjs';

// English 360° — static site generator config.
// Pure SSG output. The admin-api integration only registers Vite
// middleware during `astro dev` — production builds remain static
// HTML with no server endpoints.
export default defineConfig({
  site: 'https://english360.example',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  compressHTML: true,
  integrations: [adminApi()],
});
