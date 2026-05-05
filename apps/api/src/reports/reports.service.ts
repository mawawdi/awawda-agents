import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AgentErpAgentsResponse,
  AgentObligoResponse,
  AgentOpenDeliveryNotesResponse,
  AgentSpecialPricesResponse,
  AgentStockStatusResponse,
  AgentVendorsResponse,
} from '@awawda/shared-types';

import { isErpGatewayError } from '../erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(@Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway) {}

  async getObligo(): Promise<AgentObligoResponse> {
    this.assertMethodAvailable('getObligo');

    try {
      const snapshot = await this.erpGateway.getObligo!();
      return {
        entries: snapshot.entries.map((e) => ({
          customerId: e.customerId,
          balance: e.balance,
          creditLimit: e.creditLimit,
          currency: e.currency,
        })),
        total: snapshot.entries.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getObligo');
    }
  }

  async getOpenDeliveryNotes(): Promise<AgentOpenDeliveryNotesResponse> {
    this.assertMethodAvailable('getOpenDeliveryNotesList');

    try {
      const snapshot = await this.erpGateway.getOpenDeliveryNotesList!();
      return {
        notes: snapshot.notes.map((n) => ({
          documentId: n.documentId,
          customerId: n.customerId,
          date: n.date,
          totalAmount: n.totalAmount,
          currency: n.currency,
        })),
        total: snapshot.notes.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getOpenDeliveryNotesList');
    }
  }

  async getVendors(): Promise<AgentVendorsResponse> {
    this.assertMethodAvailable('getVendors');

    try {
      const snapshot = await this.erpGateway.getVendors!();
      return {
        vendors: snapshot.vendors.map((v) => ({
          vendorId: v.vendorId,
          name: v.name,
          isActive: v.isActive,
        })),
        total: snapshot.vendors.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getVendors');
    }
  }

  async getErpAgents(): Promise<AgentErpAgentsResponse> {
    this.assertMethodAvailable('getAgents');

    try {
      const snapshot = await this.erpGateway.getAgents!();
      return {
        agents: snapshot.agents.map((a) => ({
          agentId: a.agentId,
          name: a.name,
          isActive: a.isActive,
        })),
        total: snapshot.agents.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getAgents');
    }
  }

  async getStockStatus(): Promise<AgentStockStatusResponse> {
    this.assertMethodAvailable('getStockStatus');

    try {
      const snapshot = await this.erpGateway.getStockStatus!();
      return {
        entries: snapshot.entries.map((e) => ({
          itemId: e.itemId,
          itemName: e.itemName,
          warehouse: e.warehouse,
          quantity: e.quantity,
          unit: e.unit,
        })),
        total: snapshot.entries.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getStockStatus');
    }
  }

  async getSpecialPrices(): Promise<AgentSpecialPricesResponse> {
    this.assertMethodAvailable('getSpecialPricesIndex');

    try {
      const snapshot = await this.erpGateway.getSpecialPricesIndex!();
      return {
        lines: snapshot.lines.map((l) => ({
          itemId: l.itemId,
          itemName: l.itemName,
          unitPrice: l.unitPrice,
          currency: l.currency,
        })),
        total: snapshot.lines.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getSpecialPricesIndex');
    }
  }

  private assertMethodAvailable(method: keyof ErpGateway): void {
    if (!this.erpGateway[method]) {
      throw new HttpException(
        {
          code: 'ERP_REPORT_NOT_AVAILABLE',
          message: `ERP report method '${method}' is not configured`,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private handleErpError(error: unknown, method: string): never {
    if (isErpGatewayError(error)) {
      this.logger.warn(`ERP ${method} failed: ${error.message}`);
      throw new HttpException(
        {
          code: 'ERP_REPORT_FAILED',
          message: `ERP report '${method}' is temporarily unavailable`,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    throw error;
  }
}
