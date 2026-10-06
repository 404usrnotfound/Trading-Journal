import { headers } from 'next/headers';

// Read-only server services resolve the session from cookies, not this internal URL.
export async function serverRequest(): Promise<Request> {
  return new Request('http://internal.local', { headers: await headers() });
}
