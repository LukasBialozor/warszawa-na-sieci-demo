import { defineConfig } from 'vite';

// base './' - zbudowana gra dziala z dowolnego katalogu (GitHub Pages: /nazwa-repo/, Netlify, Cloudflare Pages...)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // licencje bibliotek z paczki (three.js, three-mesh-bvh) -> dist/THIRD_PARTY_LICENSES.md
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
  },
});
