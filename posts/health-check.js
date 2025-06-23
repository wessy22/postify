const http = require('http');
const port = 8080;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK\n");
}).listen(port);

console.log(`✅ Health check server running on port ${port}`);
