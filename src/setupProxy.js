const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy STL file requests to GitHub raw URLs to avoid CORS issues
  app.use(
    '/github-stl-files',
    createProxyMiddleware({
      target: 'https://raw.githubusercontent.com',
      changeOrigin: true,
      secure: true,
      pathRewrite: {
        '^/github-stl-files': '/dfeles/files/main', // Rewrite /github-stl-files to /dfeles/files/main
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log('[Proxy] Proxying:', req.url, '->', proxyReq.path);
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
        console.log('[Proxy] Response:', proxyRes.statusCode, 'for', req.url);
      },
      onError: (err, req, res) => {
        console.error('[Proxy] Error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy error: ' + err.message });
        }
      },
    })
  );
};
