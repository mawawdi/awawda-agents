import { Injectable } from '@nestjs/common';

import type {
  ErpOrderCancelRequest,
  ErpOrderCancelResponse,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';

@Injectable()
export class BMaxXmlAdapter {
  async handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    const xmlEnvelope = this.buildOrderEnvelope(request);
    const payloadSize = Buffer.byteLength(xmlEnvelope, "utf8");

    return {
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: `bmax-queue:${request.orderId}:${payloadSize}`,
      acceptedAt: new Date().toISOString(),
    };
  }

  async cancelOrder(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse> {
    return {
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: request.orderRef ?? request.orderId,
      canceledAt: new Date().toISOString(),
    };
  }

  private buildOrderEnvelope(request: ErpOrderHandoffRequest): string {
    const lines = request.lines
      .map(
        (line) =>
          `<Line><ItemId>${escapeXml(line.itemId)}</ItemId><Quantity>${line.quantity}</Quantity><Unit>${line.unit}</Unit><ClientUnitPrice>${line.clientUnitPrice}</ClientUnitPrice></Line>`,
      )
      .join('');

    const notes = request.notes ? `<Notes>${escapeXml(request.notes)}</Notes>` : '';

    return `<BMaxOrder><OrderId>${escapeXml(request.orderId)}</OrderId><CustomerId>${escapeXml(request.customerId)}</CustomerId>${notes}<Lines>${lines}</Lines></BMaxOrder>`;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
