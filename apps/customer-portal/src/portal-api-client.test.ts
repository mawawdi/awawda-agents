import { describe, expect, it, vi } from 'vitest';

import { PortalApiClient } from './portal-api-client';

describe('PortalApiClient submitOrder', () => {
  it('maps 503 ERP outage payload to erp_unavailable', async () => {
    const client = new PortalApiClient('/v1', vi.fn(async () => createJsonResponse(503, { code: 'CUSTOMER_ORDER_ERP_UNAVAILABLE' })));

    await expect(client.submitOrder('session-token', 'idempotency-1', { lines: [] })).rejects.toMatchObject({
      kind: 'erp_unavailable',
    });
  });

  it('maps unknown 503 payload to server', async () => {
    const client = new PortalApiClient('/v1', vi.fn(async () => createJsonResponse(503, { code: 'SOMETHING_ELSE' })));

    await expect(client.submitOrder('session-token', 'idempotency-1', { lines: [] })).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('keeps 409 mismatch mapping to order_mismatch', async () => {
    const client = new PortalApiClient(
      '/v1',
      vi.fn(async () =>
        createJsonResponse(409, {
          code: 'ORDER_LINES_MISMATCH',
          lines: [
            {
              lineIndex: 0,
              itemId: 'item-1',
              reason: 'ERP unit price changed',
              submittedUnitPrice: 42.5,
              currentUnitPrice: 49.9,
            },
          ],
        }),
      ),
    );

    await expect(client.submitOrder('session-token', 'idempotency-1', { lines: [] })).rejects.toMatchObject({
      kind: 'order_mismatch',
      mismatch: {
        code: 'ORDER_LINES_MISMATCH',
      },
    });
  });

  it('maps route-method mismatch 404 payload to actionable server error', async () => {
    const client = new PortalApiClient(
      '/v1',
      vi.fn(async () => createJsonResponse(404, { message: 'Cannot GET /v1/customer/portal-data' })),
    );

    await expect(client.getPortalData('session-token')).rejects.toMatchObject({
      kind: 'server',
      message: 'נתיב API לא תואם לשרת הפעיל. ודאו שהפורטל מצביע לשרת API נכון ובגרסה עדכנית.',
    });
  });
});

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}
