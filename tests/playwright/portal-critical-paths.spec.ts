import { expect, test } from 'playwright/test';

const apiOrigin = process.env.PORTAL_E2E_API_ORIGIN?.trim() || 'http://127.0.0.1:3301';

const blockers =
  'Blocked until T13/T16/T18 land in main: customer magic-link activation + order submit endpoints are not implemented in apps/api yet.';

test.describe('customer portal critical paths', () => {
  test.skip(true, blockers);

  test('magic-link activation happy path returns customer context', async ({ request }) => {
    const response = await request.post(`${apiOrigin}/v1/customer/links/activate`, {
      data: { token: 'valid-link-token' },
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        sessionToken: expect.any(String),
        customer: expect.objectContaining({
          customerId: expect.any(String),
          name: expect.any(String),
        }),
      }),
    );
  });

  test('order submit mismatch path returns line-level mismatch details', async ({ request }) => {
    const response = await request.post(`${apiOrigin}/v1/customer/orders`, {
      headers: {
        authorization: 'Bearer fake-session-token',
      },
      data: {
        customerId: 'hash-c-123',
        lines: [
          {
            itemId: 'hash-i-987',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 45.2,
          },
        ],
      },
    });

    expect(response.status()).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: 'PRICE_MISMATCH',
        lines: expect.arrayContaining([
          expect.objectContaining({
            itemId: 'hash-i-987',
            reason: expect.any(String),
          }),
        ]),
      }),
    );
  });
});
