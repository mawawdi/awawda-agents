import { describe, expect, it } from 'vitest';

import { BMaxXmlAdapter } from './bmax-xml.adapter';
import { CompositeErpGateway } from './composite-erp.gateway';
import { ERP_GATEWAY } from './erp.gateway';
import { HashavshevetAdapter } from './hashavshevet.adapter';
import { createApiApp } from '../server';

describe('ERP module', () => {
  it('provides the ERP gateway abstraction token', async () => {
    const app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const gateway = app.get(ERP_GATEWAY);

    expect(gateway).toBeInstanceOf(CompositeErpGateway);

    await app.close();
  });

  it('falls back to B-MAX XML when Hashavshevet is unavailable', async () => {
    const gateway = new CompositeErpGateway(new HashavshevetAdapter(), new BMaxXmlAdapter());

    const response = await gateway.handoffOrder({
      orderId: '4dadf2f2-a619-4eb0-9db7-8817ed7fd98d',
      customerId: 'customer-17',
      lines: [
        {
          itemId: 'item-1',
          quantity: 2,
          unit: 'kg',
          clientUnitPrice: 10,
        },
      ],
    });

    expect(response).toMatchObject({
      status: 'pending_retry',
      provider: 'bmax_xml',
    });
    expect(response.externalRef).toMatch(/^bmax-queue:4dadf2f2-a619-4eb0-9db7-8817ed7fd98d:\d+$/);
  });
});
