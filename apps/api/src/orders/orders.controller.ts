import { Body, Controller, Headers, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type {
  CustomerOrderMismatchResponse,
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
} from '@meatland/shared-types';

import { CustomerSessionAuthGuard } from '../sessions/customer-session-auth.guard';
import { CustomerOrderSubmitDto } from './dto/customer-order-submit.dto';
import type { CustomerOrderErpUnavailableResponse } from './orders.errors';
import { CustomerOrderIdempotencyKeyRequiredError } from './orders.errors';
import { OrdersService } from './orders.service';

@Controller({ path: 'customer/orders', version: '1' })
@UseGuards(CustomerSessionAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  async submitOrder(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-customer-id') customerId: string,
    @Headers('x-customer-session-id') customerSessionId: string,
    @Body() body: CustomerOrderSubmitDto,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<CustomerOrderSubmitResponse | CustomerOrderMismatchResponse | CustomerOrderErpUnavailableResponse> {
    const normalizedIdempotencyKey = idempotencyKey?.trim();

    if (!normalizedIdempotencyKey) {
      throw new CustomerOrderIdempotencyKeyRequiredError();
    }

    const result = await this.ordersService.submitOrder(
      {
        customerId,
        customerSessionId,
        idempotencyKey: normalizedIdempotencyKey,
      },
      body as CustomerOrderSubmitRequest,
    );

    response.status(result.statusCode);
    return result.body;
  }
}
