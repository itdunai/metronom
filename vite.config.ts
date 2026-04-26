import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: 'public_html',
  build: {
    outDir: 'public_html',
    // outDir and publicDir are the same folder in this setup.
    // Disable public copy to avoid self-copy conflicts during build.
    copyPublicDir: false,
    emptyOutDir: false,
  },
})
