export function isDirectShortURL(value) {
  return typeof value === 'string' && /^https:\/\/spoo\.me\/[A-Za-z0-9_-]{3,64}$/.test(value);
}

export async function shortenPublicURL(destination, fetcher = fetch) {
  const response = await fetcher('https://spoo.me/api/v1/shorten', {
    method: 'POST',
    body: JSON.stringify({long_url: destination}),
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('SHORTENER_HTTP_' + response.status);
  const {short_url: shortURL, long_url: target} = await response.json();
  if (!isDirectShortURL(shortURL) || target !== destination) throw new Error('SHORTENER_INVALID_RESPONSE');
  // The documented API returns the destination. Do not probe the visitor URL
  // from a Worker: anti-bot responses can reject a link that works in browsers.
  return shortURL;
}
