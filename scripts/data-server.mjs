import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3001;
const PUBLIC_DIR = path.resolve('public');

http.createServer((req, res) => {
  // Decode URL to handle spaces and special characters
  const decodedUrl = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(PUBLIC_DIR, decodedUrl);
  
  // Prevent directory traversal attacks
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }

      // Basic content type mapping
      let contentType = 'application/octet-stream';
      if (filePath.endsWith('.json')) contentType = 'application/json';
      else if (filePath.endsWith('.html')) contentType = 'text/html';
      else if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      else if (filePath.endsWith('.ico')) contentType = 'image/x-icon';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*', // Enable CORS
        'Cache-Control': 'no-cache',         // Disable cache in dev
      });
      res.end(data);
    });
  });
}).listen(PORT, () => {
  console.log(`[Data Server] Running at http://localhost:${PORT}`);
});
