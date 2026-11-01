const origin = {
  async fetch(request) {
    if (request.redirect !== 'manual') throw new Error('Expected manual redirect handling');
    if (!new URL(request.url).searchParams.has('_keepalive'))
      throw new Error('Missing cache nonce');
    if (request.headers.get('cache-control') !== 'no-cache, no-store')
      throw new Error('Missing cache bypass');
    return Response.json(
      {
        status: 'ok',
        database: 'reachable',
        service: 'deals-marketplace-prototype',
        sha: 'a'.repeat(40),
        commit: 'a'.repeat(40),
        time: new Date().toISOString(),
      },
      { headers: { 'x-vercel-cache': 'MISS', age: '0' } },
    );
  },
};

export default origin;
