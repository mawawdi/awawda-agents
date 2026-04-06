import { describe, expect, it, vi } from 'vitest';

import { OrdersService } from './orders.service';
import type { ErpGateway } from '../erp/erp.gateway';

describe('OrdersService', () => {
  it('forwards valid order payload to ERP gateway', async () => {
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn().mockResolvedValue({
        status: 'submitted',
        provider: 'hashavshevet',
        externalRef: 'erp-77',
        acceptedAt: '2026-04-06T18:00:00.000Z',
      }),
      getHealth: vi.fn(),
    };

    const service = new OrdersService(erpGateway);
    const request = {
      orderId: 'order-77',
      customerId: 'customer-7',
      lines: [
        {
          itemId: 'item-1',
          quantity: 2,
          unit: 'kg' as const,
          clientUnitPrice: 45.2,
        },
      ],
      notes: 'Cut thin',
    };

    await expect(service.handoffToErp(request)).resolves.toEqual({
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: 'erp-77',
      acceptedAt: '2026-04-06T18:00:00.000Z',
    });
    expect(erpGateway.handoffOrder).toHaveBeenCalledWith(request);
  });

  it('propagates ERP errors without mutating business failure details', async () => {
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn().mockRejectedValue(new Error('ERP timeout')),
      getHealth: vi.fn(),
    };

    const service = new OrdersService(erpGateway);

    await expect(
      service.handoffToErp({
        orderId: 'order-78',
        customerId: 'customer-7',
        lines: [
          {
            itemId: 'item-1',
            quantity: 1,
            unit: 'unit',
            clientUnitPrice: 12,
          },
        ],
      }),
    ).rejects.toThrow('ERP timeout');
  });
});
