// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  site: 'https://karlvolsung88.github.io',
  base: '/galeria-3d-clase',
  prefetch: false,
});
