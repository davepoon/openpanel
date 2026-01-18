import { createFileRoute } from '@tanstack/react-router';

/**
 * API Proxy Route for Railway Deployment
 * 
 * This route proxies API requests through the dashboard to solve the
 * Railway public suffix domain cookie sharing issue.
 * 
 * Problem: Railway's .up.railway.app domains are on the Public Suffix List,
 * which means cookies can't be shared between different subdomains.
 * 
 * Solution: Proxy all API calls through the dashboard server, which then
 * uses Railway's private networking to communicate with the API service.
 * 
 * Set INTERNAL_API_URL to the Railway private networking URL:
 * http://<api-service>.railway.internal:<port>
 */

async function proxyRequest(request: Request): Promise<Response> {
  const internalApiUrl = process.env.INTERNAL_API_URL || process.env.API_URL;
  
  if (!internalApiUrl) {
    return new Response(JSON.stringify({ error: 'API URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract the path after /api/op/
  const url = new URL(request.url);
  const pathAfterProxy = url.pathname.replace(/^\/api\/op\/?/, '');
  const targetUrl = `${internalApiUrl}/${pathAfterProxy}${url.search}`;

  console.log(`[API Proxy] ${request.method} ${url.pathname} -> ${targetUrl}`);

  try {
    // Forward the request to the internal API
    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        // Remove host header to avoid conflicts
        host: new URL(internalApiUrl).host,
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    });

    // Create response headers, forwarding all headers from the API
    const responseHeaders = new Headers();
    proxyResponse.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Return the proxied response
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[API Proxy] Error:', error);
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const Route = createFileRoute('/api/op/$')({
  server: {
    handlers: {
      GET: proxyRequest,
      POST: proxyRequest,
      PUT: proxyRequest,
      PATCH: proxyRequest,
      DELETE: proxyRequest,
      OPTIONS: proxyRequest,
    },
  },
});
