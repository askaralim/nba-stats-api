const WebServer = require('./server');

const PORT = process.env.PORT || 3000;

const server = new WebServer(PORT);
server.start();

