// Cloudflare Pages Function - RAWG proxy for Nexus Game Hub.
// RAWG (rawg.io) has screenshots, a description and a trailer for games on ALL
// platforms, including Nintendo / PlayStation exclusives that are not on Steam.
// The RAWG API needs a key; we inject it server-side from the RAWG_API_KEY secret
// so it never ships to the browser or sits in the public repo. Reachable at:
//   /api/rawg?url=<encoded https://api.rawg.io/... url>
// If the secret is not set it returns 501 rawg_api_key_missing and the app quietly
// falls back to cover-only (nothing breaks). Set it in the Pages project:
//   Settings -> Variables and Secrets -> RAWG_API_KEY

const ALLOWED_HOST = /^https:\/\/api\.rawg\.io\//i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  const key = env && env.RAWG_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({
        error: 'rawg_api_key_missing',
        message: 'RAWG enrichment is not configured: the RAWG_API_KEY secret is not set on this deployment.',
      }),
      { status: 501, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return new Response('Missing ?url= parameter', { status: 400, headers: CORS });
  }
  if (!ALLOWED_HOST.test(target)) {
    return new Response('Host not allowed', { status: 403, headers: CORS });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Malformed ?url= value', { status: 400, headers: CORS });
  }
  targetUrl.searchParams.set('key', key); // inject the secret server-side

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'NexusGameHub (+https://nexus-game-hub.pages.dev)',
        'Accept': 'application/json',
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        // RAWG data is essentially static; cache a day to stay well within limits.
        'Cache-Control': upstream.ok ? 'public, max-age=86400' : 'no-store',
      },
    });
  } catch (err) {
    return new Response('Upstream fetch failed: ' + ((err && err.message) || err), {
      status: 502,
      headers: CORS,
    });
  }
}
