// Serverless Steam proxy for Nexus Game Hub.
// Steam's public endpoints (appdetails, community profiles) block direct browser
// requests with no CORS headers. Free public CORS proxies are unreliable, so we
// run our own on Netlify: this function fetches Steam server-side (no CORS limit)
// and returns the raw body to the front-end. Called as:
//   /.netlify/functions/steam?url=<encoded steam url>
// Hosts are allow-listed so it can't be abused as an open proxy.

const ALLOWED_HOST = /^https:\/\/(store\.steampowered\.com|steamcommunity\.com|api\.steampowered\.com)\//i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const target = event.queryStringParameters && event.queryStringParameters.url;
  if (!target) {
    return { statusCode: 400, headers: CORS, body: 'Missing ?url= parameter' };
  }
  if (!ALLOWED_HOST.test(target)) {
    return { statusCode: 403, headers: CORS, body: 'Host not allowed' };
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (NexusGameHub; +https://nexus-game-hub.netlify.app)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        // Cache successful lookups for an hour to stay well within limits.
        'Cache-Control': 'public, max-age=3600',
      },
      body,
    };
  } catch (err) {
    return { statusCode: 502, headers: CORS, body: 'Upstream fetch failed: ' + err.message };
  }
};
