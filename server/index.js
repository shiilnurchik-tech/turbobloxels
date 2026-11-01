import { createApp } from './app.js';
import { closeDb, DATA_DIR } from './db.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`TurboBloxels: http://${HOST}:${PORT}  (данные: ${DATA_DIR})`);
});

function shutdown(signal) {
  console.log(`\n[server] ${signal}, сохраняю данные...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => closeDb());
