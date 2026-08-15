import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパス配下に公開されるため、
  // デプロイワークフローから VITE_BASE_PATH（例: /dashboard-cxo/）を渡す。
  // ローカル開発や独自ドメインでは未設定のまま '/' でよい。
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
