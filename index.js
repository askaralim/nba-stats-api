require('dotenv').config();

const WebServer = require('./server');

const PORT = process.env.PORT || 3000;

const server = new WebServer(PORT);
server.start();

let shutting = false;
async function shutdown(signal) {
  if (shutting) return;
  shutting = true;
  console.log(`[Shutdown] Received ${signal}, draining...`);
  try {
    await server.stop();
    console.log('[Shutdown] Clean exit.');
    process.exit(0);
  } catch (err) {
    console.error('[Shutdown] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
});

