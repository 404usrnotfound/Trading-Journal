import createClient from 'openapi-fetch';
import type { paths } from './generated/api.js';

export const createApiClient = (baseUrl = '') =>
  createClient<paths>({ baseUrl, credentials: 'same-origin' });
