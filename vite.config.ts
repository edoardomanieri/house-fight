/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Mette un identificativo unico della build in dist/sw.js. Il browser installa un nuovo service worker
 * solo se il file cambia: senza questo, una PWA già installata potrebbe restare alla versione vecchia.
 */
function swVersion(): Plugin {
  const id = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}-${Date.now().toString(36)}`
  let outDir = 'dist'
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', id))
    },
  }
}

// base relativa: funziona sia in locale sia su GitHub Pages (/<repo>/)
export default defineConfig({
  base: './',
  plugins: [react(), swVersion()],
})
