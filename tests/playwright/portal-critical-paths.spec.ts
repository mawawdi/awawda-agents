import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const portalBaseUrl = 'http://127.0.0.1:4173';

const activationResponse = {
  sessionToken: 'session-token-77',
  customer: {
    customerId: 'cust-777',
  },
  sessionExpiresAt: '2026-04-08T14:00:00.000Z',
  recentItems: [
    {
      itemId: 'item-1',
      name: 'Ribeye Steak',
      lastOrderedAt: '2026-04-07T10:00:00.000Z',
    },
  ],
  approvedItems: [
    {
      hashItemId: 'item-2',
      addedByAgentId: 'agent-9',
      createdAt: '2026-04-06T09:00:00.000Z',
    },
  ],
  pricing: [
    { itemId: 'item-1', unitPrice: 42.5, currency: 'ILS' },
    { itemId: 'item-2', unitPrice: 50, currency: 'ILS' },
  ],
  priceListVersion: 'v-1',
};

const portalDataResponse = {
  customer: {
    customerId: 'cust-777',
  },
  sessionExpiresAt: '2026-04-08T14:00:00.000Z',
  recentItems: activationResponse.recentItems,
  approvedItems: activationResponse.approvedItems,
  pricing: activationResponse.pricing,
  priceListVersion: 'v-1',
};

let portalDevServer: ChildProcessWithoutNullStreams;

test.describe('customer portal browser critical paths', () => {
  test.beforeAll(async () => {
    portalDevServer = spawn(
      'pnpm',
      ['--filter', '@meatland/customer-portal', 'dev', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      },
    );

    await waitForServer(`${portalBaseUrl}/order`);
  });

  test.afterAll(async () => {
    if (!portalDevServer.killed) {
      portalDevServer.kill('SIGTERM');
    }

    await new Promise<void>((resolve) => {
      portalDevServer.once('exit', () => resolve());
      setTimeout(() => resolve(), 5_000);
    });
  });

  test('activation route supports mismatch recovery and success confirmation', async ({ page }) => {
    let activationRequestToken: string | undefined;
    let activationCallCount = 0;
    let portalDataCallCount = 0;
    const idempotencyKeys: string[] = [];
    let submitCallCount = 0;

    await page.route('**/v1/customer/sessions/activate', async (route) => {
      activationCallCount += 1;
      activationRequestToken = route.request().postDataJSON()?.token;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activationResponse),
      });
    });

    await page.route('**/v1/customer/portal-data', async (route) => {
      portalDataCallCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalDataResponse),
      });
    });

    await page.route('**/v1/customer/orders', async (route) => {
      submitCallCount += 1;
      idempotencyKeys.push(route.request().headers()['idempotency-key'] ?? '');
      if (submitCallCount === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ORDER_LINES_MISMATCH',
            lines: [
              {
                lineIndex: 0,
                itemId: 'item-1',
                reason: 'ERP unit price changed from 42.50 to 49.90',
                submittedUnitPrice: 42.5,
                currentUnitPrice: 49.9,
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'order-77',
          orderRef: 'ORD-2026-00077',
          status: 'submitted',
        }),
      });
    });

    const activationResponseWait = page.waitForResponse((response) =>
      response.url().includes('/v1/customer/sessions/activate'),
    );
    const portalDataResponseWait = page.waitForResponse((response) => response.url().includes('/v1/customer/portal-data'));

    await page.goto(`${portalBaseUrl}/m/token-abc`);

    await activationResponseWait;
    await portalDataResponseWait;
    await expect(page).toHaveURL(`${portalBaseUrl}/order`);
    expect(activationRequestToken).toBe('token-abc');
    expect(activationCallCount).toBe(1);
    expect(portalDataCallCount).toBeGreaterThan(0);
    await expect(page.getByTestId('portal-heading')).toContainText('קטלוג');
    await expect(page.getByTestId('portal-shell')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('portal-shell')).toHaveAttribute('lang', 'he');

    await page.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }).click();
    await expect(page.getByText('סה״כ יחידות: 1')).toBeVisible();
    await expect(page.getByLabel('סיכום הזמנה')).toContainText('42.50');

    await page.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).click();
    await expect(page.getByTestId('submit-mismatch')).toContainText('ERP unit price changed from 42.50 to 49.90');

    await page.getByRole('button', { name: 'אישור מחדש ושליחה' }).click();
    await expect(page.getByTestId('submit-success')).toContainText('אסמכתא: ORD-2026-00077');
    await expect(page.locator('[data-testid="submit-success"] bdi')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' })).toBeDisabled();

    expect(submitCallCount).toBe(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBeTruthy();
    expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
  });

  test('submit shows ERP outage guidance and allows retry without reload', async ({ page }) => {
    let submitCallCount = 0;

    await page.route('**/v1/customer/sessions/activate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activationResponse),
      });
    });

    await page.route('**/v1/customer/portal-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalDataResponse),
      });
    });

    await page.route('**/v1/customer/orders', async (route) => {
      submitCallCount += 1;

      if (submitCallCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'CUSTOMER_ORDER_ERP_UNAVAILABLE' }),
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'order-78',
          orderRef: 'ORD-2026-00078',
          status: 'submitted',
        }),
      });
    });

    await page.goto(`${portalBaseUrl}/m/token-erp-outage`);
    await expect(page).toHaveURL(`${portalBaseUrl}/order`);
    await expect(page.getByTestId('portal-heading')).toContainText('קטלוג');

    await page.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }).click();
    await page.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).click();

    await expect(page.getByTestId('submit-error')).toContainText(
      'ההזמנות זמנית לא זמינות בגלל תקלה ב-ERP. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".',
    );
    await expect(page.getByRole('button', { name: 'נסו לשלוח שוב' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' })).toBeEnabled();

    await page.getByRole('button', { name: 'נסו לשלוח שוב' }).click();

    await expect(page.getByTestId('submit-success')).toContainText('אסמכתא: ORD-2026-00078');
    expect(submitCallCount).toBe(2);
  });

  test('activation route accepts query-token links', async ({ page }) => {
    let activationRequestToken: string | undefined;

    await page.route('**/v1/customer/sessions/activate', async (route) => {
      activationRequestToken = route.request().postDataJSON()?.token;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activationResponse),
      });
    });

    await page.route('**/v1/customer/portal-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalDataResponse),
      });
    });

    await page.goto(`${portalBaseUrl}/m?token=query-token-123`);

    await expect(page).toHaveURL(`${portalBaseUrl}/order`);
    await expect(page.getByTestId('portal-heading')).toContainText('קטלוג');
    expect(activationRequestToken).toBe('query-token-123');
  });

  test('order route shows weak-network and resilient error UI on load failure', async ({ page }) => {
    await page.addInitScript((session) => {
      window.sessionStorage.setItem('customer-portal-session', JSON.stringify(session));
    }, {
      sessionToken: activationResponse.sessionToken,
      customerId: activationResponse.customer.customerId,
      sessionExpiresAt: activationResponse.sessionExpiresAt,
      payload: portalDataResponse,
    });

    await page.route('**/v1/customer/portal-data', async (route) => {
      await page.waitForTimeout(3_000);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }),
      });
    });

    await page.goto(`${portalBaseUrl}/order`);

    await expect(page.getByTestId('order-weak-network')).toContainText('הרשת איטית');
    await expect(page.getByRole('heading', { name: 'לא הצלחנו לטעון את ההזמנה' })).toBeVisible();
    await expect(page.getByText('לא ניתן לטעון את נתוני ההזמנה כרגע. נסו שוב בעוד רגע.')).toBeVisible();
  });

  test('logout clears active session and routes back to activation state', async ({ page }) => {
    let logoutCalls = 0;

    await page.addInitScript((session) => {
      window.sessionStorage.setItem('customer-portal-session', JSON.stringify(session));
    }, {
      sessionToken: activationResponse.sessionToken,
      customerId: activationResponse.customer.customerId,
      sessionExpiresAt: activationResponse.sessionExpiresAt,
      payload: portalDataResponse,
    });

    await page.route('**/v1/customer/portal-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(portalDataResponse),
      });
    });

    await page.route('**/v1/customer/session/logout', async (route) => {
      logoutCalls += 1;
      await route.fulfill({
        status: 204,
      });
    });

    await page.goto(`${portalBaseUrl}/order`);

    await expect(page.getByTestId('portal-heading')).toContainText('קטלוג');
    await page.getByRole('button', { name: 'התנתקות מהסשן' }).click();

    await expect(page).toHaveURL(`${portalBaseUrl}/m`);
    await expect(page.getByRole('heading', { name: 'הפעלת הקישור נכשלה' })).toBeVisible();
    expect(logoutCalls).toBe(1);
  });
});

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for dev server: ${url}`);
}
