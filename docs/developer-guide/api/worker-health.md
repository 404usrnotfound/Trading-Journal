# Private worker health API

These two GETs belong to the private worker listener, default `127.0.0.1:3101`, not the web origin or cookie-authenticated OpenAPI surface. Source: [worker](../../../apps/worker/src/index.ts). Do not expose the listener publicly.

## GET /health/live

**Purpose:** Report worker process liveness/shutdown state.

**Authentication and authorization:** no cookie authentication; private configured host/network access is the boundary.

**Parameters/body/validation:** no path or query parameters and no body. GET only; other methods return 405 with Allow: GET and status method-not-allowed. Unknown paths return 404 with status not-found.

**Response schema/errors:** 200 JSON `{"status":"ok"}`; 503 JSON `{"status":"unavailable"}`. Worker errors use this small status object, not the web Problem envelope. Listener startup/queue failure can instead cause connection refusal.

**Example request and response:**

```http
GET /health/live HTTP/1.1
Host: 127.0.0.1:3101

HTTP/1.1 200
Content-Type: application/json; charset=utf-8

{"status":"ok"}
```

## GET /health/ready

**Purpose:** Report the latest infrastructure queue round-trip readiness; not every native outbox generation.

**Authentication and authorization:** no cookie authentication; private configured host/network access is the boundary.

**Parameters/body/validation:** no path or query parameters and no body. GET only; other methods return 405 with Allow: GET and status method-not-allowed. Unknown paths return 404 with status not-found.

**Response schema/errors:** 200 JSON `{"status":"ok"}`; 503 JSON `{"status":"unavailable"}`. Worker errors use this small status object, not the web Problem envelope. Listener startup/queue failure can instead cause connection refusal.

**Example request and response:**

```http
GET /health/ready HTTP/1.1
Host: 127.0.0.1:3101

HTTP/1.1 200
Content-Type: application/json; charset=utf-8

{"status":"ok"}
```

See [operations](../../operations.md#health-checks) and [verification](../verification.md) for actual execution and production limits.
