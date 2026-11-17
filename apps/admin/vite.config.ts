import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * Inject noindex meta tag for non-production environments
 * to prevent search engines from indexing dev/staging sites.
 * Also generates the appropriate robots.txt at build time.
 */
function noIndexPlugin(): Plugin {
  const isProduction = process.env.VITE_APP_ENV === 'production';

  return {
    name: 'inject-noindex',
    transformIndexHtml(html) {
      if (isProduction) return html;
      return html.replace(
        '</head>',
        '    <meta name="robots" content="noindex, nofollow" />\n  </head>',
      );
    },
    generateBundle() {
      // Emit the correct robots.txt based on environment
      const content = isProduction ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: content,
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), vue(), noIndexPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Resolve shared package from source (TS) to avoid CJS/ESM mismatch in Vite
      '@edu/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5002,
    strictPort: true, // port bentrok -> error, jangan pindah ke port aplikasi lain
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
