export function isDirectShortURL(value) {
  return typeof value === 'string' && /^https:\/\/cleanuri\.com\/[A-Za-z0-9_-]{3,24}$/.test(value);
}

export async function shortenPublicURL(destination, fetcher = fetch) {
  const response = await fetcher('https://cleanuri.com/api/v1/shorten', {
    method: 'POST',
    body: new URLSearchParams({url: destination}),
    headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('SHORTENER_UNAVAILABLE');
  const {result_url: shortURL} = await response.json();
  if (!isDirectShortURL(shortURL)) throw new Error('SHORTENER_INVALID_RESPONSE');
  // Only offer URLs that currently redirect straight to this puzzle.
  // A provider landing page must never be mistaken for a working direct link.
  const redirect = await fetcher(shortURL, {redirect: 'manual', signal: AbortSignal.timeout(4000)});
  const direct = [301, 302, 303, 307, 308].includes(redirect.status) && redirect.headers.get('Location') === destination;
  await redirect.body?.cancel();
  if (!direct) throw new Error('SHORTENER_REQUIRES_CONFIRMATION');
  return shortURL;
}
