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

  test('activation route redirects to /order and supports quantity composition', async ({ page }) => {
    let activationRequestToken: string | undefined;
    let activationCallCount = 0;
    let portalDataCallCount = 0;

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
    await expect(page.getByRole('heading', { name: 'Compose order' })).toBeVisible();

    await page.getByRole('button', { name: 'Increase Ribeye Steak' }).click();
    await page.getByRole('button', { name: 'Increase Approved item item-2' }).click();

    await expect(page.getByText('Total units: 2')).toBeVisible();
    await expect(page.getByText('Estimated total: 92.50')).toBeVisible();
    await expect(page.getByTestId('sticky-submit-bar')).toContainText('Submit order (2 units)');
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

    await expect(page.getByTestId('order-weak-network')).toContainText('Network is slow');
    await expect(page.getByRole('heading', { name: 'Could not load your order' })).toBeVisible();
    await expect(page.getByText('Unable to load order data right now. Please retry in a moment.')).toBeVisible();
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
