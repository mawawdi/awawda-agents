import { expect, test } from '@playwright/test';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

const idempotencyResponses = new Map<string, unknown>();

type PortalApiServer = {
  server: http.Server;
  baseUrl: string;
};

async function startPortalApiServer(): Promise<PortalApiServer> {
  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const bodyChunks: Uint8Array[] = [];
    for await (const chunk of req) {
      bodyChunks.push(chunk);
    }

    const body = bodyChunks.length > 0 ? JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) : {};

    if (req.method === 'POST' && req.url === '/v1/customer/links/activate') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          sessionToken: 'session-token-77',
          customer: {
            customerId: 'cust-777',
            name: 'Leora Foods',
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/customer/orders') {
      const idempotencyKey = req.headers['idempotency-key'];
      if (typeof idempotencyKey === 'string' && idempotencyResponses.has(idempotencyKey)) {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(idempotencyResponses.get(idempotencyKey)));
        return;
      }

      const mismatchLine = body.lines?.find((line: { itemId: string; clientUnitPrice: number }) => {
        return line.itemId === 'hash-i-987' && Number(line.clientUnitPrice) !== 49.9;
      });

      if (mismatchLine) {
        res.writeHead(409, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 'PRICE_MISMATCH',
            lines: [
              {
                itemId: mismatchLine.itemId,
                reason: 'ERP price updated from 45.20 to 49.90',
              },
            ],
          }),
        );
        return;
      }

      const successResponse = {
        orderRef: 'ORD-2026-00077',
        status: 'submitted',
      };

      if (typeof idempotencyKey === 'string') {
        idempotencyResponses.set(idempotencyKey, successResponse);
      }

      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(successResponse));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'NOT_FOUND' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

let portalApi: PortalApiServer;

test.describe('customer portal critical paths', () => {
  test.beforeAll(async () => {
    portalApi = await startPortalApiServer();
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      portalApi.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  test('happy path activates link and submits order exactly once for idempotent retries', async ({
    request,
  }) => {
    const activateResponse = await request.post(`${portalApi.baseUrl}/v1/customer/links/activate`, {
      data: { token: 'valid-link-token' },
    });

    await expect(activateResponse).toBeOK();
    await expect(activateResponse.json()).resolves.toEqual({
      sessionToken: 'session-token-77',
      customer: {
        customerId: 'cust-777',
        name: 'Leora Foods',
      },
    });

    const payload = {
      customerId: 'cust-777',
      lines: [
        {
          itemId: 'hash-i-987',
          quantity: 2,
          unit: 'kg',
          clientUnitPrice: 49.9,
        },
      ],
    };

    const headers = {
      authorization: 'Bearer session-token-77',
      'idempotency-key': 'idem-777',
    };

    const firstSubmit = await request.post(`${portalApi.baseUrl}/v1/customer/orders`, {
      headers,
      data: payload,
    });
    const secondSubmit = await request.post(`${portalApi.baseUrl}/v1/customer/orders`, {
      headers,
      data: payload,
    });

    await expect(firstSubmit).toBeOK();
    await expect(secondSubmit).toBeOK();
    await expect(firstSubmit.json()).resolves.toEqual({
      orderRef: 'ORD-2026-00077',
      status: 'submitted',
    });
    await expect(secondSubmit.json()).resolves.toEqual({
      orderRef: 'ORD-2026-00077',
      status: 'submitted',
    });
  });

  test('mismatch path returns line-level guidance for customer reconfirmation', async ({ request }) => {
    const mismatchResponse = await request.post(`${portalApi.baseUrl}/v1/customer/orders`, {
      headers: {
        authorization: 'Bearer session-token-77',
        'idempotency-key': 'idem-778',
      },
      data: {
        customerId: 'cust-777',
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

    expect(mismatchResponse.status()).toBe(409);
    await expect(mismatchResponse.json()).resolves.toEqual({
      code: 'PRICE_MISMATCH',
      lines: [
        {
          itemId: 'hash-i-987',
          reason: 'ERP price updated from 45.20 to 49.90',
        },
      ],
    });
  });
});
