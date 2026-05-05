import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AgentCustomerBalanceResponse,
  AgentCustomerDeliveryNotesResponse,
  AgentCustomerLedgerResponse,
  AgentCustomerSpecialPricingResponse,
} from '@awawda/shared-types';

import { isErpGatewayError } from '../erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { AGENT_CUSTOMERS_REPOSITORY } from './customers.constants';
import { AgentAssignmentRequiredError } from './customers.errors';
import type { AgentCustomersRepository } from './customers.types';

@Injectable()
export class CustomerReportsService {
  private readonly logger = new Logger(CustomerReportsService.name);

  constructor(
    @Inject(AGENT_CUSTOMERS_REPOSITORY) private readonly customersRepository: AgentCustomersRepository,
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
  ) {}

  async getCustomerBalance(agentId: string, customerId: string): Promise<AgentCustomerBalanceResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    this.assertMethodAvailable('getCustomerBalance');

    try {
      const snapshot = await this.erpGateway.getCustomerBalance!(customerId);
      return {
        customerId,
        entries: snapshot.entries.map((e) => ({
          customerId: e.customerId,
          balance: e.balance,
          currency: e.currency,
        })),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getCustomerBalance', customerId);
    }
  }

  async getCustomerLedger(agentId: string, customerId: string): Promise<AgentCustomerLedgerResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    this.assertMethodAvailable('getCustomerLedger');

    try {
      const snapshot = await this.erpGateway.getCustomerLedger!(customerId);
      return {
        customerId,
        entries: snapshot.entries.map((e) => ({
          customerId: e.customerId,
          documentId: e.documentId,
          date: e.date,
          description: e.description,
          debit: e.debit,
          credit: e.credit,
          balance: e.balance,
          currency: e.currency,
        })),
        total: snapshot.entries.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleErpError(error, 'getCustomerLedger', customerId);
    }
  }

  async getCustomerDeliveryNotes(
    agentId: string,
    customerId: string,
  ): Promise<AgentCustomerDeliveryNotesResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    this.assertMethodAvailable('getOpenDeliveryNotesByCustomer');

    try {
      const snapshot = await this.erpGateway.getOpenDeliveryNotesByCustomer!(customerId);
      return {
        customerId,
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
      return this.handleErpError(error, 'getOpenDeliveryNotesByCustomer', customerId);
    }
  }

  async getCustomerSpecialPricing(
    agentId: string,
    customerId: string,
  ): Promise<AgentCustomerSpecialPricingResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    this.assertMethodAvailable('getCustomerSpecialPricing');

    try {
      const snapshot = await this.erpGateway.getCustomerSpecialPricing!(customerId);
      return {
        customerId,
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
      return this.handleErpError(error, 'getCustomerSpecialPricing', customerId);
    }
  }

  private async assertAssignedCustomer(agentId: string, customerId: string): Promise<void> {
    const isAssigned = await this.customersRepository.isAgentAssignedToCustomer(agentId, customerId);
    if (!isAssigned) {
      throw new AgentAssignmentRequiredError();
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

  private handleErpError(error: unknown, method: string, customerId: string): never {
    if (isErpGatewayError(error)) {
      this.logger.warn(`ERP ${method} failed for customer ${customerId}: ${error.message}`);
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
