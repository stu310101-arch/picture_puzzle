export async function shortenPublicURL(destination, fetcher = fetch) {
  const endpoint = new URL('https://da.gd/s');
  endpoint.searchParams.set('url', destination);
  const response = await fetcher(endpoint.href, { signal: AbortSignal.timeout(12000), headers: { Accept: 'text/plain' } });
  if (!response.ok) throw new Error('SHORTENER_UNAVAILABLE');
  const shortURL = (await response.text()).trim();
  if (!/^https:\/\/da\.gd\/[A-Za-z0-9_-]{3,24}$/.test(shortURL)) throw new Error('SHORTENER_INVALID_RESPONSE');
  return shortURL;
}
