'use client';

import { createApiClient } from '@journal/contracts/client';

// Relative URLs preserve the browser's same-origin cookies and origin checks.
// Tokens and authorization claims never enter browser persistence.
export const apiClient = createApiClient();
