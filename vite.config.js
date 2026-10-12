import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// base must match your GitHub repo name so built asset paths resolve under
// https://<you>.github.io/music-room-vr/ — only applied for the production build,
// so the local dev server still serves from https://localhost:5173/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-room-vr/' : '/',
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
}));
