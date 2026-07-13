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
      redirect: 'follow',
      headers: {
        // Present as a real browser — Steam serves cleaner responses and is less
        // likely to gate a datacenter request behind an interstitial.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        // Skip the store's age gate + force a stable region/language so appdetails
        // returns data for mature titles instead of {"success":false}.
        'Cookie': 'birthtime=568022401; wants_mature_content=1; Steam_Language=english',
      },
    });
    const body = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        ...CORS,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        // Cache successful lookups for an hour to stay well within Steam's limits.
        'Cache-Control': upstream.ok ? 'public, max-age=3600' : 'no-store',
      },
      body,
    };
  } catch (err) {
    return { statusCode: 502, headers: CORS, body: 'Upstream fetch failed: ' + (err && err.message || err) };
  }
};
