import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      path: 'path-browserify',
      // buffer: 'buffer/',// not working, probably because buffer is not imported but is actually a global
    }
  }
});