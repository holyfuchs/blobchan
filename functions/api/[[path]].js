/**
 * CORS proxy for QuickNode beacon API.
 * QuickNode doesn't set CORS headers, so we proxy through Cloudflare.
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetPath = url.pathname.replace('/api/', '/');
  const targetUrl = `https://quick-wandering-shape.ethereum-sepolia.quiknode.pro/6472c8913762e103c23199b1a2a6e422c137701a${targetPath}${url.search}`;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Proxy the request
  const proxyReq = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  const response = await fetch(proxyReq);
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
}
