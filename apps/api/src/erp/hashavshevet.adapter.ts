import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { AgentCatalogItem } from '@awawda/shared-types';

import { resolveHashEnvironment } from '../runtime/production-guardrails';
import { ERP_ERROR_CODES, ErpGatewayError, type ErpErrorCode } from './erp.errors';
import type {
  ErpOrderCancelRequest,
  ErpOrderCancelResponse,
  ErpGatewayAssignedCustomersSnapshot,
  ErpGatewayAgentsSnapshot,
  ErpGatewayCatalogSnapshot,
  ErpGatewayCustomerBalanceSnapshot,
  ErpGatewayCustomerLedgerSnapshot,
  ErpGatewayCustomerPricingSnapshot,
  ErpGatewayCustomerRecentItemsSnapshot,
  ErpGatewayCustomerSpecialPricingSnapshot,
  ErpGatewayHealth,
  ErpGatewayObligoSnapshot,
  ErpGatewayOpenDeliveryNotesByCustomerSnapshot,
  ErpGatewayOpenDeliveryNotesListSnapshot,
  ErpGatewaySpecialPricesIndexSnapshot,
  ErpGatewayStockStatusSnapshot,
  ErpGatewayVendorsSnapshot,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';

type RetryPolicy = {
  maxAttempts: number;
  initialBackoffMs: number;
};

type HashEnvironment = 'testing' | 'production';

type HConnectReportParamsTemplate = string | null;
type HConnectPluginFamily = 'heshin' | 'kupain' | 'bankin' | 'itemin' | 'movein' | 'stockheaderin';
type HConnectPluginHandler = (pluginData: unknown, pluginOverride?: string) => Promise<unknown>;

type HConnectConfig = {
  enabled: boolean;
  endpointUrl: string;
  station: string;
  company: string;
  netPassportId: string;
  signatureToken: string | null;
  handoffPlugin: string;
  handoffDocumentId: string;
  handoffAccountKey: string | null;
  reports: {
    assignedCustomers: string | null;
    catalog: string | null;
    recentItems: string | null;
    pricing: string | null;
    obligo: string | null;
    openDeliveryNotesList: string | null;
    vendors: string | null;
    specialPricesIndex: string | null;
    agents: string | null;
    openDeliveryNotesByCustomer: string | null;
    customerSpecialPricing: string | null;
    customerBalance: string | null;
    customerLedger: string | null;
    stockStatus: string | null;
  };
  reportParamsTemplates: {
    assignedCustomers: HConnectReportParamsTemplate;
    catalog: HConnectReportParamsTemplate;
    recentItems: HConnectReportParamsTemplate;
    pricing: HConnectReportParamsTemplate;
    obligo: HConnectReportParamsTemplate;
    openDeliveryNotesList: HConnectReportParamsTemplate;
    vendors: HConnectReportParamsTemplate;
    specialPricesIndex: HConnectReportParamsTemplate;
    agents: HConnectReportParamsTemplate;
    openDeliveryNotesByCustomer: HConnectReportParamsTemplate;
    customerSpecialPricing: HConnectReportParamsTemplate;
    customerBalance: HConnectReportParamsTemplate;
    customerLedger: HConnectReportParamsTemplate;
    stockStatus: HConnectReportParamsTemplate;
  };
};

type HashavshevetConfig = {
  environment: HashEnvironment;
  restEnabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  requestTimeoutMs: number;
  healthPath: string;
  assignedCustomersPath: string;
  catalogPath: string;
  recentItemsPath: string;
  pricingPath: string;
  hconnect: HConnectConfig;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 200,
};

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const RETRYABLE_HANDOFF_ERROR_CODES: ReadonlySet<ErpErrorCode> = new Set([
  ERP_ERROR_CODES.ERP_UNAVAILABLE,
  ERP_ERROR_CODES.ERP_TIMEOUT,
]);
const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_ASSIGNED_CUSTOMERS_PATH = '/agents/{agentId}/customers';
const DEFAULT_CATALOG_PATH = '/catalog/items';
const DEFAULT_RECENT_ITEMS_PATH = '/customers/{customerId}/recent-items';
const DEFAULT_PRICING_PATH = '/customers/{customerId}/pricing';

const DEFAULT_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
const REPORTS_PLUGIN = 'reports';
const DEFAULT_HANDOFF_PLUGIN = 'imovein';
const DEFAULT_HANDOFF_DOCUMENT_ID = '30';
const HCONNECT_DEFAULT_PLUGIN_BY_FAMILY: Record<HConnectPluginFamily, string> = {
  heshin: 'iheshin',
  kupain: 'ikupain',
  bankin: 'ibankin',
  itemin: 'iitemin',
  movein: DEFAULT_HANDOFF_PLUGIN,
  stockheaderin: 'istockheaderin',
};

@Injectable()
export class HashavshevetAdapter {
  private readonly config = loadHashavshevetConfig();
  private readonly retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;
  private readonly pluginCapabilityHandlers: Record<HConnectPluginFamily, HConnectPluginHandler> = {
    heshin: this.invokeHeshinPlugin.bind(this),
    kupain: this.invokeKupainPlugin.bind(this),
    bankin: this.invokeBankinPlugin.bind(this),
    itemin: this.invokeIteminPlugin.bind(this),
    movein: this.invokeMoveinPlugin.bind(this),
    stockheaderin: this.invokeStockheaderinPlugin.bind(this),
  };

  async handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    return this.withRetry('hashavshevet.handoffOrder', async () => {
      if (!this.config.hconnect.enabled) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
          'Hashavshevet adapter skeleton is wired, but live transport is not configured yet.',
        );
      }

      return this.handoffOrderViaHConnect(request);
    });
  }

  async cancelOrder(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse> {
    return this.withRetry('hashavshevet.cancelOrder', async () => {
      if (!this.config.hconnect.enabled) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
          'Hashavshevet adapter skeleton is wired, but live transport is not configured yet.',
        );
      }

      return this.cancelOrderViaHConnect(request);
    });
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    if (this.config.hconnect.enabled) {
      const firstReport =
        this.config.hconnect.reports.assignedCustomers ??
        this.config.hconnect.reports.catalog ??
        this.config.hconnect.reports.recentItems ??
        this.config.hconnect.reports.pricing;

      if (!firstReport) {
        return {
          provider: 'hashavshevet',
          status: 'degraded',
          detail: 'Hashavshevet H-Connect is configured but no report mappings were provided.',
        };
      }

      try {
        await this.invokeCapabilityPlugin('heshin', {
          encrypt_reportData: firstReport,
        }, REPORTS_PLUGIN);
        return {
          provider: 'hashavshevet',
          status: 'up',
          detail: `Hashavshevet H-Connect ${this.config.environment} endpoint is reachable.`,
        };
      } catch (error) {
        if (error instanceof ErpGatewayError && error.code === ERP_ERROR_CODES.ERP_VALIDATION_FAILED) {
          return {
            provider: 'hashavshevet',
            status: 'degraded',
            detail: `Hashavshevet H-Connect reachable, but report probe validation failed: ${error.message}`,
          };
        }

        return {
          provider: 'hashavshevet',
          status: 'down',
          detail:
            error instanceof ErpGatewayError
              ? error.message
              : 'Hashavshevet H-Connect health probe failed with an unknown error.',
        };
      }
    }

    if (!this.config.restEnabled) {
      return {
        provider: 'hashavshevet',
        status: 'degraded',
        detail: 'Hashavshevet live pull disabled (no HASH_API_URL/HASH_*_API_URL configured).',
      };
    }

    try {
      const payload = await this.fetchJsonRecord(this.resolveEndpoint(this.config.healthPath));
      const normalizedStatus = normalizeHealthStatus(readOptionalString(payload, ['status', 'health']));

      return {
        provider: 'hashavshevet',
        status: normalizedStatus,
        detail:
          readOptionalString(payload, ['detail', 'message']) ??
          `Hashavshevet ${this.config.environment} endpoint is reachable.`,
      };
    } catch (error) {
      return {
        provider: 'hashavshevet',
        status: 'down',
        detail:
          error instanceof ErpGatewayError
            ? error.message
            : 'Hashavshevet health probe failed with an unknown error.',
      };
    }
  }

  async getAssignedCustomers(agentId: string): Promise<ErpGatewayAssignedCustomersSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.assignedCustomers;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'assignedCustomers', {
        agentId,
      });
      return this.mapAssignedCustomersPayload(payload);
    }

    if (!this.config.restEnabled) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Assigned customers report is not configured. Set HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS or enable REST.',
      );
    }

    const payload = await this.fetchJson(this.resolveEndpoint(this.config.assignedCustomersPath, { agentId }));
    return this.mapAssignedCustomersPayload(payload);
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.catalog;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'catalog', {});
      return this.mapCatalogPayload(payload);
    }

    if (!this.config.restEnabled) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Catalog report is not configured. Set HASH_HCONNECT_REPORT_CATALOG or enable REST.',
      );
    }

    const payload = await this.fetchJson(this.resolveEndpoint(this.config.catalogPath));
    return this.mapCatalogPayload(payload);
  }

  async getCustomerRecentItems(customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.recentItems;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'recentItems', {
        customerId,
      });
      return this.mapRecentItemsPayload(payload, customerId);
    }

    if (!this.config.restEnabled) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Recent items report is not configured. Set HASH_HCONNECT_REPORT_RECENT_ITEMS or enable REST.',
      );
    }

    const payload = await this.fetchJson(
      this.resolveEndpoint(this.config.recentItemsPath, {
        customerId,
      }),
    );
    return this.mapRecentItemsPayload(payload, customerId);
  }

  async getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.pricing;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'pricing', {
        customerId,
      });
      return this.mapPricingPayload(payload, customerId);
    }

    if (!this.config.restEnabled) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Pricing report is not configured. Set HASH_HCONNECT_REPORT_PRICING or enable REST.',
      );
    }

    const payload = await this.fetchJson(
      this.resolveEndpoint(this.config.pricingPath, {
        customerId,
      }),
    );
    return this.mapPricingPayload(payload, customerId);
  }

  async getVendors(): Promise<ErpGatewayVendorsSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.vendors;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'vendors', {});
      return this.mapVendorsPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Vendors report is not configured. Set HASH_HCONNECT_REPORT_VENDORS.',
    );
  }

  async getSpecialPricesIndex(): Promise<ErpGatewaySpecialPricesIndexSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.specialPricesIndex;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'specialPricesIndex', {});
      return this.mapSpecialPricesIndexPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Special prices index report is not configured. Set HASH_HCONNECT_REPORT_SPECIAL_PRICES_INDEX.',
    );
  }

  async getAgents(): Promise<ErpGatewayAgentsSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.agents;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'agents', {});
      return this.mapAgentsPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Agents report is not configured. Set HASH_HCONNECT_REPORT_AGENTS.',
    );
  }

  async getObligo(): Promise<ErpGatewayObligoSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.obligo;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'obligo', {});
      return this.mapObligoPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Obligo report is not configured. Set HASH_HCONNECT_REPORT_OBLIGO.',
    );
  }

  async getOpenDeliveryNotesList(): Promise<ErpGatewayOpenDeliveryNotesListSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.openDeliveryNotesList;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'openDeliveryNotesList', {});
      return this.mapOpenDeliveryNotesListPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Open delivery notes list report is not configured. Set HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_LIST.',
    );
  }

  async getOpenDeliveryNotesByCustomer(customerId: string): Promise<ErpGatewayOpenDeliveryNotesByCustomerSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.openDeliveryNotesByCustomer;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'openDeliveryNotesByCustomer', {
        customerId,
      });
      return this.mapOpenDeliveryNotesByCustomerPayload(payload, customerId);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Open delivery notes by customer report is not configured. Set HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_BY_CUSTOMER.',
    );
  }

  async getCustomerSpecialPricing(customerId: string): Promise<ErpGatewayCustomerSpecialPricingSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.customerSpecialPricing;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'customerSpecialPricing', {
        customerId,
      });
      return this.mapCustomerSpecialPricingPayload(payload, customerId);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Customer special pricing report is not configured. Set HASH_HCONNECT_REPORT_CUSTOMER_SPECIAL_PRICING.',
    );
  }

  async getCustomerBalance(customerId: string): Promise<ErpGatewayCustomerBalanceSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.customerBalance;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'customerBalance', {
        customerId,
      });
      return this.mapCustomerBalancePayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Customer balance report is not configured. Set HASH_HCONNECT_REPORT_CUSTOMER_BALANCE.',
    );
  }

  async getCustomerLedger(customerId: string): Promise<ErpGatewayCustomerLedgerSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.customerLedger;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'customerLedger', {
        customerId,
      });
      return this.mapCustomerLedgerPayload(payload, customerId);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Customer ledger report is not configured. Set HASH_HCONNECT_REPORT_CUSTOMER_LEDGER.',
    );
  }

  async getStockStatus(): Promise<ErpGatewayStockStatusSnapshot> {
    const reportEncrypted = this.config.hconnect.reports.stockStatus;
    if (this.config.hconnect.enabled && reportEncrypted) {
      const payload = await this.fetchHConnectReportData(reportEncrypted, 'stockStatus', {});
      return this.mapStockStatusPayload(payload);
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
      'Stock status report is not configured. Set HASH_HCONNECT_REPORT_STOCK_STATUS.',
    );
  }

  private mapAssignedCustomersPayload(payload: unknown): ErpGatewayAssignedCustomersSnapshot {
    const entries = mapPayloadArrayLoose(payload, ['customers', 'data']);
    const customers = entries.flatMap((entry) => {
      const customerId = readOptionalIdentifier(entry, [
        'customerId',
        'id',
        'hashCustomerId',
        'customerCode',
        'customerNumber',
        'cardCode',
        'AccountKey',
        'accountKey',
      ]);

      if (!customerId) {
        return [];
      }

      return [
        {
          customerId,
          isActive: readOptionalBoolean(entry, ['isActive', 'active', 'enabled']) ?? true,
        },
      ];
    });

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      customers,
    };
  }

  private mapCatalogPayload(payload: unknown): ErpGatewayCatalogSnapshot {
    const items = mapPayloadArray(payload, ['items', 'data']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id', 'ItemKey', 'itemKey'], 'itemId'),
      sku: readRequiredString(entry, ['sku', 'code', 'Sku', 'ItemCode', 'itemCode'], 'sku'),
      name: readRequiredString(entry, ['name', 'description', 'ItemName', 'itemName'], 'name'),
      unit: normalizeUnit(readRequiredString(entry, ['unit', 'uom', 'Unit'], 'unit')),
      isActive: readOptionalBoolean(entry, ['isActive', 'active']) ?? true,
      category:
        (readOptionalString(entry, ['category', 'Category']) as AgentCatalogItem['category'] | null | undefined) ??
        undefined,
      iconEmoji: readOptionalString(entry, ['iconEmoji', 'icon_emoji', 'emoji']) ?? undefined,
      imageUrl: readOptionalString(entry, ['imageUrl', 'image_url', 'iconUrl']) ?? undefined,
      isTestingOnly: readOptionalBoolean(entry, ['isTestingOnly', 'testingOnly']) ?? undefined,
    }));

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      items,
    };
  }

  private mapRecentItemsPayload(
    payload: unknown,
    customerId: string,
  ): ErpGatewayCustomerRecentItemsSnapshot {
    const now = new Date().toISOString();
    const items = mapPayloadArray(payload, ['items', 'data']).map((entry) => {
      const lastOrderedAtRaw = readOptionalString(entry, ['lastOrderedAt', 'orderedAt', 'lastPurchaseAt', 'DateF']);
      const itemId =
        readOptionalIdentifier(entry, ['itemId', 'id', 'ItemKey', 'itemKey']) ?? `recent-${customerId}-unknown`;
      const unit = readOptionalString(entry, ['unit', 'uom', 'Unit']);
      return {
        itemId,
        name: readRequiredString(entry, ['name', 'description', 'ItemName', 'itemName'], 'name'),
        lastOrderedAt: normalizeIsoTimestamp(lastOrderedAtRaw, now),
        unit: unit ? normalizeUnit(unit) : 'kg',
      };
    });

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      items,
    };
  }

  private mapPricingPayload(payload: unknown, customerId: string): ErpGatewayCustomerPricingSnapshot {
    const payloadRecord = extractRecord(payload);
    const lines = mapPayloadArray(payload, ['lines', 'pricing', 'data']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id', 'ItemKey', 'itemKey'], 'itemId'),
      unitPrice: readRequiredNumber(entry, ['unitPrice', 'price', 'netPrice', 'Price1', 'price1'], 'unitPrice'),
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      version:
        payloadRecord !== null
          ? readOptionalString(payloadRecord, ['version', 'priceListVersion']) ?? `price-list-${customerId}`
          : `price-list-${customerId}`,
      lines,
    };
  }

  private mapVendorsPayload(payload: unknown): ErpGatewayVendorsSnapshot {
    const entries = mapPayloadArrayLoose(payload, ['vendors', 'data']);
    const vendors = entries.flatMap((entry) => {
      const vendorId = readOptionalIdentifier(entry, [
        'vendorId',
        'id',
        'AccountKey',
        'accountKey',
        'supplierCode',
        'SupplierKey',
      ]);
      if (!vendorId) return [];
      return [
        {
          vendorId,
          name: readOptionalString(entry, ['name', 'vendorName', 'AccountName', 'accountName', 'SupplierName']) ?? '',
          isActive: readOptionalBoolean(entry, ['isActive', 'active', 'enabled']) ?? true,
        },
      ];
    });

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), vendors };
  }

  private mapSpecialPricesIndexPayload(payload: unknown): ErpGatewaySpecialPricesIndexSnapshot {
    const lines = mapPayloadArray(payload, ['lines', 'data', 'prices']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id', 'ItemKey', 'itemKey'], 'itemId'),
      itemName: readOptionalString(entry, ['itemName', 'name', 'ItemName', 'description']) ?? '',
      unitPrice: readRequiredNumber(entry, ['unitPrice', 'price', 'netPrice', 'Price1', 'specialPrice'], 'unitPrice'),
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), lines };
  }

  private mapAgentsPayload(payload: unknown): ErpGatewayAgentsSnapshot {
    const entries = mapPayloadArrayLoose(payload, ['agents', 'data']);
    const agents = entries.flatMap((entry) => {
      const agentId = readOptionalIdentifier(entry, [
        'agentId',
        'id',
        'AgentKey',
        'agentKey',
        'AccountKey',
        'accountKey',
      ]);
      if (!agentId) return [];
      return [
        {
          agentId,
          name: readOptionalString(entry, ['name', 'agentName', 'AgentName', 'AccountName', 'accountName']) ?? '',
          isActive: readOptionalBoolean(entry, ['isActive', 'active', 'enabled']) ?? true,
        },
      ];
    });

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), agents };
  }

  private mapObligoPayload(payload: unknown): ErpGatewayObligoSnapshot {
    const entries = mapPayloadArray(payload, ['entries', 'data', 'obligo']).map((entry) => ({
      customerId: readRequiredString(entry, ['customerId', 'id', 'AccountKey', 'accountKey', 'customerCode'], 'customerId'),
      balance: readRequiredNumber(entry, ['balance', 'totalBalance', 'Balance', 'amount'], 'balance'),
      creditLimit: readOptionalNumber(entry, ['creditLimit', 'CreditLimit', 'limit']) ?? 0,
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), entries };
  }

  private mapOpenDeliveryNotesListPayload(payload: unknown): ErpGatewayOpenDeliveryNotesListSnapshot {
    const notes = mapPayloadArray(payload, ['notes', 'data', 'documents']).map((entry) => ({
      documentId: readRequiredString(entry, ['documentId', 'id', 'DocumentID', 'docNumber', 'Reference'], 'documentId'),
      customerId: readOptionalString(entry, ['customerId', 'AccountKey', 'accountKey', 'customerCode']) ?? '',
      date: readOptionalString(entry, ['date', 'DateF', 'documentDate', 'Date']) ?? '',
      totalAmount: readOptionalNumber(entry, ['totalAmount', 'total', 'Total', 'amount', 'Amount']) ?? 0,
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), notes };
  }

  private mapOpenDeliveryNotesByCustomerPayload(
    payload: unknown,
    customerId: string,
  ): ErpGatewayOpenDeliveryNotesByCustomerSnapshot {
    const notes = mapPayloadArray(payload, ['notes', 'data', 'documents']).map((entry) => ({
      documentId: readRequiredString(entry, ['documentId', 'id', 'DocumentID', 'docNumber', 'Reference'], 'documentId'),
      customerId: readOptionalString(entry, ['customerId', 'AccountKey', 'accountKey', 'customerCode']) ?? customerId,
      date: readOptionalString(entry, ['date', 'DateF', 'documentDate', 'Date']) ?? '',
      totalAmount: readOptionalNumber(entry, ['totalAmount', 'total', 'Total', 'amount', 'Amount']) ?? 0,
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), customerId, notes };
  }

  private mapCustomerSpecialPricingPayload(
    payload: unknown,
    customerId: string,
  ): ErpGatewayCustomerSpecialPricingSnapshot {
    const lines = mapPayloadArray(payload, ['lines', 'data', 'prices']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id', 'ItemKey', 'itemKey'], 'itemId'),
      itemName: readOptionalString(entry, ['itemName', 'name', 'ItemName', 'description']) ?? '',
      unitPrice: readRequiredNumber(entry, ['unitPrice', 'price', 'netPrice', 'Price1', 'specialPrice'], 'unitPrice'),
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), customerId, lines };
  }

  private mapCustomerBalancePayload(payload: unknown): ErpGatewayCustomerBalanceSnapshot {
    const entries = mapPayloadArray(payload, ['entries', 'data', 'balances']).map((entry) => ({
      customerId: readRequiredString(entry, ['customerId', 'id', 'AccountKey', 'accountKey', 'customerCode'], 'customerId'),
      balance: readRequiredNumber(entry, ['balance', 'totalBalance', 'Balance', 'amount'], 'balance'),
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), entries };
  }

  private mapCustomerLedgerPayload(payload: unknown, customerId: string): ErpGatewayCustomerLedgerSnapshot {
    const entries = mapPayloadArray(payload, ['entries', 'data', 'transactions']).map((entry) => ({
      customerId: readOptionalString(entry, ['customerId', 'AccountKey', 'accountKey']) ?? customerId,
      documentId: readOptionalString(entry, ['documentId', 'DocumentID', 'docNumber', 'Reference']) ?? '',
      date: readOptionalString(entry, ['date', 'DateF', 'transactionDate', 'Date']) ?? '',
      description: readOptionalString(entry, ['description', 'Details', 'details', 'Memo', 'memo']) ?? '',
      debit: readOptionalNumber(entry, ['debit', 'Debit', 'debitAmount']) ?? 0,
      credit: readOptionalNumber(entry, ['credit', 'Credit', 'creditAmount']) ?? 0,
      balance: readOptionalNumber(entry, ['balance', 'Balance', 'runningBalance']) ?? 0,
      currency: readOptionalString(entry, ['currency', 'Currency']) ?? 'ILS',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), customerId, entries };
  }

  private mapStockStatusPayload(payload: unknown): ErpGatewayStockStatusSnapshot {
    const entries = mapPayloadArray(payload, ['entries', 'data', 'stock', 'items']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id', 'ItemKey', 'itemKey'], 'itemId'),
      itemName: readOptionalString(entry, ['itemName', 'name', 'ItemName', 'description']) ?? '',
      warehouse: readOptionalString(entry, ['warehouse', 'Warehouse', 'warehouseCode', 'WarehouseKey']) ?? '',
      quantity: readRequiredNumber(entry, ['quantity', 'Quantity', 'qty', 'balance', 'Balance', 'stock'], 'quantity'),
      unit: readOptionalString(entry, ['unit', 'uom', 'Unit']) ?? 'unit',
    }));

    return { source: 'hashavshevet', syncedAt: resolveSyncedAt(payload), entries };
  }

  private async handoffOrderViaHConnect(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    const plugin = this.config.hconnect.handoffPlugin.trim().toLowerCase();
    if (plugin !== HCONNECT_DEFAULT_PLUGIN_BY_FAMILY.movein) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        `Hashavshevet handoff plugin "${plugin}" is not implemented in this release.`,
      );
    }

    const referenceDigits = request.orderId.replaceAll(/\D+/g, '').slice(0, 9);
    const reference = referenceDigits.length > 0 ? referenceDigits : request.orderId.replaceAll('-', '').slice(0, 9);
    const accountKey = this.config.hconnect.handoffAccountKey ?? request.customerId;

    const pluginData = request.lines.map((line) => ({
      accountKey,
      documentid: this.config.hconnect.handoffDocumentId,
      reference,
      itemkey: line.itemId,
      quantity: line.quantity.toFixed(3),
      price: line.clientUnitPrice.toFixed(2),
      remarks: request.notes ?? '',
      ...(request.hashAgentId ? { agentId: request.hashAgentId } : {}),
    }));

    const payload = await this.invokeCapabilityPlugin('movein', pluginData, plugin);
    const responseRecord = extractPrimaryRecord(payload);

    const externalRef =
      (responseRecord
        ? readOptionalIdentifier(responseRecord, [
            'externalRef',
            'orderRef',
            'reference',
            'Reference',
            'DocumentID',
            'docNumber',
          ])
        : null) ?? `${plugin}:${request.orderId}`;

    const now = new Date().toISOString();

    return {
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef,
      acceptedAt:
        (responseRecord ? readOptionalString(responseRecord, ['acceptedAt', 'createdAt', 'timestamp']) : null) ??
        now,
    };
  }

  private async cancelOrderViaHConnect(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse> {
    const plugin = this.config.hconnect.handoffPlugin.trim().toLowerCase();
    if (plugin !== HCONNECT_DEFAULT_PLUGIN_BY_FAMILY.movein) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        `Hashavshevet handoff plugin "${plugin}" is not implemented in this release.`,
      );
    }

    const referenceBase = request.orderRef ?? request.orderId;
    const referenceDigits = referenceBase.replaceAll(/\D+/g, '').slice(0, 9);
    const reference =
      referenceDigits.length > 0 ? referenceDigits : referenceBase.replaceAll('-', '').slice(0, 9);
    const accountKey = this.config.hconnect.handoffAccountKey ?? request.customerId;

    const pluginData = [
      {
        accountKey,
        documentid: this.config.hconnect.handoffDocumentId,
        reference,
        action: 'cancel',
        orderid: request.orderId,
        orderref: request.orderRef ?? '',
        remarks: request.reason ?? '',
      },
    ];

    const payload = await this.invokeCapabilityPlugin('movein', pluginData, plugin);
    const responseRecord = extractPrimaryRecord(payload);
    const now = new Date().toISOString();

    return {
      status: 'cancelled',
      provider: 'hashavshevet',
      externalRef:
        (responseRecord
          ? readOptionalIdentifier(responseRecord, [
              'externalRef',
              'orderRef',
              'reference',
              'Reference',
              'DocumentID',
              'docNumber',
            ])
          : null) ?? referenceBase,
      canceledAt:
        (responseRecord ? readOptionalString(responseRecord, ['canceledAt', 'cancelledAt', 'timestamp']) : null) ??
        now,
    };
  }

  private async fetchHConnectReportData(
    encryptedReportData: string,
    reportKey: keyof HConnectConfig['reportParamsTemplates'],
    vars: Record<string, string>,
  ): Promise<unknown> {
    const pluginData: Record<string, unknown> = {
      encrypt_reportData: encryptedReportData,
    };

    const paramsData = this.resolveReportParams(reportKey, vars);
    if (paramsData !== null) {
      pluginData.params_data = paramsData;
    }

    const responsePayload = await this.invokeCapabilityPlugin('heshin', pluginData, REPORTS_PLUGIN);
    return normalizeHConnectReportResponse(responsePayload);
  }

  private async invokeCapabilityPlugin(
    family: HConnectPluginFamily,
    pluginData: unknown,
    pluginOverride?: string,
  ): Promise<unknown> {
    const handler = this.pluginCapabilityHandlers[family];
    if (!handler) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
        `Hashavshevet plugin capability "${family}" is not supported.`,
      );
    }

    return handler(pluginData, pluginOverride);
  }

  private async invokeHeshinPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('heshin', pluginData, pluginOverride);
  }

  private async invokeKupainPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('kupain', pluginData, pluginOverride);
  }

  private async invokeBankinPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('bankin', pluginData, pluginOverride);
  }

  private async invokeIteminPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('itemin', pluginData, pluginOverride);
  }

  private async invokeMoveinPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('movein', pluginData, pluginOverride);
  }

  private async invokeStockheaderinPlugin(pluginData: unknown, pluginOverride?: string): Promise<unknown> {
    return this.invokePluginViaTransport('stockheaderin', pluginData, pluginOverride);
  }

  private async invokePluginViaTransport(
    family: HConnectPluginFamily,
    pluginData: unknown,
    pluginOverride?: string,
  ): Promise<unknown> {
    const plugin = resolveHConnectPluginName(family, pluginOverride);
    return this.invokeHConnectPlugin(plugin, pluginData);
  }

  private resolveReportParams(
    reportKey: keyof HConnectConfig['reportParamsTemplates'],
    vars: Record<string, string>,
  ): unknown[] | null {
    const template = this.config.hconnect.reportParamsTemplates[reportKey];
    if (template && template.trim().length > 0) {
      return parseAndApplyTemplate(template, vars);
    }

    if (reportKey === 'assignedCustomers' && vars.agentId) {
      return buildDefaultParamData(vars.agentId);
    }

    if (
      (reportKey === 'recentItems' ||
        reportKey === 'pricing' ||
        reportKey === 'openDeliveryNotesByCustomer' ||
        reportKey === 'customerSpecialPricing' ||
        reportKey === 'customerBalance' ||
        reportKey === 'customerLedger') &&
      vars.customerId
    ) {
      return buildDefaultParamData(vars.customerId);
    }

    return null;
  }

  private async invokeHConnectPlugin(plugin: string, pluginData: unknown): Promise<unknown> {
    if (!this.config.hconnect.enabled) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Hashavshevet H-Connect transport is not configured.',
      );
    }

    const signatureToken = this.config.hconnect.signatureToken;
    if (!signatureToken) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_AUTH_FAILED,
        'HASH_HCONNECT_SIGNATURE_TOKEN is required for H-Connect plugin requests.',
      );
    }

    const endpoint = new URL(this.config.hconnect.endpointUrl);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    const requestBody = {
      station: this.config.hconnect.station,
      plugin,
      company: this.config.hconnect.company,
      message: {
        netPassportID: this.config.hconnect.netPassportId,
        pluginData,
      },
      signature: createHash('md5').update(`${JSON.stringify(pluginData)}${signatureToken}`).digest('hex'),
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const payload = await parseJsonResponse(response, endpoint);
      if (!response.ok) {
        throw mapHttpStatusToGatewayError(response.status, endpoint.pathname, payload);
      }

      const hconnectError = detectHConnectError(payload);
      if (hconnectError) {
        throw hconnectError;
      }

      return payload;
    } catch (error) {
      if (error instanceof ErpGatewayError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_TIMEOUT,
          `Hashavshevet request timed out after ${this.config.requestTimeoutMs}ms.`,
          error,
        );
      }

      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_UNAVAILABLE,
        `Hashavshevet request failed for ${endpoint.pathname}.`,
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let delayMs = this.retryPolicy.initialBackoffMs;

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        if (isNonRetryableHandoffError(error)) {
          throw error;
        }

        const isLastAttempt = attempt === this.retryPolicy.maxAttempts;
        if (isLastAttempt) {
          throw new ErpGatewayError(
            ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
            `${operation} failed after ${attempt} attempts.`,
            error,
          );
        }

        await sleep(delayMs);
        delayMs *= 2;
      }
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
      `${operation} failed unexpectedly.`,
    );
  }

  private resolveEndpoint(pathTemplate: string, params: Record<string, string> = {}): URL {
    const endpoint = interpolatePath(pathTemplate, params);
    const baseUrl = this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`;
    return new URL(endpoint.replace(/^\/+/, ''), baseUrl);
  }

  private async fetchJson(endpoint: URL): Promise<unknown> {
    const response = await this.fetchResponse(endpoint);
    return parseJsonResponse(response, endpoint);
  }

  private async fetchJsonRecord(endpoint: URL): Promise<Record<string, unknown>> {
    return assertRecord(await this.fetchJson(endpoint), 'Hashavshevet response');
  }

  private async fetchResponse(endpoint: URL): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: buildHeaders(this.config.apiKey),
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      throw mapHttpStatusToGatewayError(response.status, endpoint.pathname);
    } catch (error) {
      if (error instanceof ErpGatewayError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_TIMEOUT,
          `Hashavshevet request timed out after ${this.config.requestTimeoutMs}ms.`,
          error,
        );
      }

      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_UNAVAILABLE,
        `Hashavshevet request failed for ${endpoint.pathname}.`,
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

function resolveHConnectPluginName(
  family: HConnectPluginFamily,
  pluginOverride?: string,
): string {
  if (pluginOverride !== undefined) {
    const normalizedOverride = pluginOverride.trim().toLowerCase();
    if (normalizedOverride.length === 0) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
        `Hashavshevet plugin override for ${family} cannot be empty.`,
      );
    }

    return normalizedOverride;
  }

  const defaultPlugin = HCONNECT_DEFAULT_PLUGIN_BY_FAMILY[family];
  if (!defaultPlugin) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `Hashavshevet plugin capability "${family}" is not configured.`,
    );
  }

  return defaultPlugin;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNonRetryableHandoffError(error: unknown): boolean {
  return error instanceof ErpGatewayError && !RETRYABLE_HANDOFF_ERROR_CODES.has(error.code);
}

function loadHashavshevetConfig(env: NodeJS.ProcessEnv = process.env): HashavshevetConfig {
  const environment = resolveHashEnvironment(env.HASH_ENV);
  const baseUrl = resolveBaseUrl(environment, env);
  const apiKey = resolveApiKey(environment, env);

  const hconnect = loadHConnectConfig(env);
  const restEnabled = baseUrl.length > 0;

  if (environment === 'production') {
    const hasHconnectCredentials =
      hconnect.station.length > 0 &&
      hconnect.company.length > 0 &&
      hconnect.netPassportId.length > 0 &&
      hconnect.signatureToken !== null;

    if (hconnect.enabled && !hasHconnectCredentials) {
      throw new Error(
        'HASH_ENV=production with HASH_HCONNECT_ENABLED=true requires HASH_HCONNECT_STATION, HASH_HCONNECT_COMPANY, HASH_HCONNECT_NET_PASSPORT_ID, and HASH_HCONNECT_SIGNATURE_TOKEN.',
      );
    }

    if (!restEnabled && !(hconnect.enabled && hasHconnectCredentials)) {
      throw new Error(
        'HASH_ENV=production requires live Hashavshevet credentials. Configure HASH_API_URL/HASH_PROD_API_URL with key or enable HASH_HCONNECT with full credentials.',
      );
    }

    if (restEnabled && apiKey === null && !(hconnect.enabled && hasHconnectCredentials)) {
      throw new Error(
        'HASH_ENV=production forbids unauthenticated Hashavshevet REST calls. Set HASH_API_KEY/HASH_PROD_API_KEY or enable HASH_HCONNECT with full credentials.',
      );
    }
  }

  return {
    environment,
    restEnabled,
    baseUrl,
    apiKey,
    requestTimeoutMs: resolvePositiveInteger(env.HASH_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    healthPath: env.HASH_HEALTH_PATH?.trim() || DEFAULT_HEALTH_PATH,
    assignedCustomersPath: env.HASH_ASSIGNED_CUSTOMERS_PATH?.trim() || DEFAULT_ASSIGNED_CUSTOMERS_PATH,
    catalogPath: env.HASH_CATALOG_PATH?.trim() || DEFAULT_CATALOG_PATH,
    recentItemsPath: env.HASH_RECENT_ITEMS_PATH?.trim() || DEFAULT_RECENT_ITEMS_PATH,
    pricingPath: env.HASH_PRICING_PATH?.trim() || DEFAULT_PRICING_PATH,
    hconnect,
  };
}

function loadHConnectConfig(env: NodeJS.ProcessEnv): HConnectConfig {
  const station = env.HASH_HCONNECT_STATION?.trim() ?? '';
  const company = env.HASH_HCONNECT_COMPANY?.trim() ?? '';
  const netPassportId = env.HASH_HCONNECT_NET_PASSPORT_ID?.trim() ?? '';
  const signatureToken = env.HASH_HCONNECT_SIGNATURE_TOKEN?.trim() || null;
  const hasRequiredConfig =
    station.length > 0 && company.length > 0 && netPassportId.length > 0 && signatureToken !== null;
  const enabled = resolveOptionalBoolean(env.HASH_HCONNECT_ENABLED) ?? hasRequiredConfig;

  return {
    enabled,
    endpointUrl: env.HASH_HCONNECT_ENDPOINT_URL?.trim() || DEFAULT_HCONNECT_ENDPOINT_URL,
    station,
    company,
    netPassportId,
    signatureToken,
    handoffPlugin: env.HASH_HCONNECT_HANDOFF_PLUGIN?.trim() || DEFAULT_HANDOFF_PLUGIN,
    handoffDocumentId: env.HASH_HCONNECT_HANDOFF_DOCUMENT_ID?.trim() || DEFAULT_HANDOFF_DOCUMENT_ID,
    handoffAccountKey: env.HASH_HCONNECT_HANDOFF_ACCOUNT_KEY?.trim() || null,
    reports: {
      assignedCustomers: env.HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS?.trim() || null,
      catalog: env.HASH_HCONNECT_REPORT_CATALOG?.trim() || null,
      recentItems: env.HASH_HCONNECT_REPORT_RECENT_ITEMS?.trim() || null,
      pricing: env.HASH_HCONNECT_REPORT_PRICING?.trim() || null,
      obligo: env.HASH_HCONNECT_REPORT_OBLIGO?.trim() || null,
      openDeliveryNotesList: env.HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_LIST?.trim() || null,
      vendors: env.HASH_HCONNECT_REPORT_VENDORS?.trim() || null,
      specialPricesIndex: env.HASH_HCONNECT_REPORT_SPECIAL_PRICES_INDEX?.trim() || null,
      agents: env.HASH_HCONNECT_REPORT_AGENTS?.trim() || null,
      openDeliveryNotesByCustomer: env.HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_BY_CUSTOMER?.trim() || null,
      customerSpecialPricing: env.HASH_HCONNECT_REPORT_CUSTOMER_SPECIAL_PRICING?.trim() || null,
      customerBalance: env.HASH_HCONNECT_REPORT_CUSTOMER_BALANCE?.trim() || null,
      customerLedger: env.HASH_HCONNECT_REPORT_CUSTOMER_LEDGER?.trim() || null,
      stockStatus: env.HASH_HCONNECT_REPORT_STOCK_STATUS?.trim() || null,
    },
    reportParamsTemplates: {
      assignedCustomers: env.HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS_PARAMS_JSON ?? null,
      catalog: env.HASH_HCONNECT_REPORT_CATALOG_PARAMS_JSON ?? null,
      recentItems: env.HASH_HCONNECT_REPORT_RECENT_ITEMS_PARAMS_JSON ?? null,
      pricing: env.HASH_HCONNECT_REPORT_PRICING_PARAMS_JSON ?? null,
      obligo: env.HASH_HCONNECT_REPORT_OBLIGO_PARAMS_JSON ?? null,
      openDeliveryNotesList: env.HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_LIST_PARAMS_JSON ?? null,
      vendors: env.HASH_HCONNECT_REPORT_VENDORS_PARAMS_JSON ?? null,
      specialPricesIndex: env.HASH_HCONNECT_REPORT_SPECIAL_PRICES_INDEX_PARAMS_JSON ?? null,
      agents: env.HASH_HCONNECT_REPORT_AGENTS_PARAMS_JSON ?? null,
      openDeliveryNotesByCustomer: env.HASH_HCONNECT_REPORT_OPEN_DELIVERY_NOTES_BY_CUSTOMER_PARAMS_JSON ?? null,
      customerSpecialPricing: env.HASH_HCONNECT_REPORT_CUSTOMER_SPECIAL_PRICING_PARAMS_JSON ?? null,
      customerBalance: env.HASH_HCONNECT_REPORT_CUSTOMER_BALANCE_PARAMS_JSON ?? null,
      customerLedger: env.HASH_HCONNECT_REPORT_CUSTOMER_LEDGER_PARAMS_JSON ?? null,
      stockStatus: env.HASH_HCONNECT_REPORT_STOCK_STATUS_PARAMS_JSON ?? null,
    },
  };
}

function resolveBaseUrl(environment: HashEnvironment, env: NodeJS.ProcessEnv): string {
  const explicit = env.HASH_API_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const byEnvironment =
    environment === 'production' ? env.HASH_PROD_API_URL?.trim() : env.HASH_TEST_API_URL?.trim();
  return byEnvironment ?? '';
}

function resolveApiKey(environment: HashEnvironment, env: NodeJS.ProcessEnv): string | null {
  const explicit = env.HASH_API_KEY?.trim();
  if (explicit) {
    return explicit;
  }

  const byEnvironment =
    environment === 'production' ? env.HASH_PROD_API_KEY?.trim() : env.HASH_TEST_API_KEY?.trim();
  return byEnvironment && byEnvironment.length > 0 ? byEnvironment : null;
}

function resolvePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('HASH_REQUEST_TIMEOUT_MS must be a positive integer');
  }

  return parsed;
}

function resolveOptionalBoolean(rawValue: string | undefined): boolean | null {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

function buildHeaders(apiKey: string | null): HeadersInit {
  if (!apiKey) {
    return {
      accept: 'application/json',
    };
  }

  return {
    accept: 'application/json',
    'x-api-key': apiKey,
    authorization: `Bearer ${apiKey}`,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function parseJsonResponse(response: Response, endpoint: URL): Promise<unknown> {
  return response
    .text()
    .then((body) => {
      if (body.trim().length === 0) {
        return {};
      }

      try {
        return JSON.parse(body) as unknown;
      } catch (error) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
          `Hashavshevet returned invalid JSON for ${endpoint.pathname}.`,
          error,
        );
      }
    });
}

function mapHttpStatusToGatewayError(
  status: number,
  pathname: string,
  payload?: unknown,
): ErpGatewayError {
  const payloadMessage = detectHConnectErrorMessage(payload);

  if (status === 401 || status === 403) {
    return new ErpGatewayError(
      ERP_ERROR_CODES.ERP_AUTH_FAILED,
      payloadMessage ?? `Hashavshevet authentication failed (${status}) for ${pathname}.`,
    );
  }

  if (status >= 500) {
    return new ErpGatewayError(
      ERP_ERROR_CODES.ERP_UNAVAILABLE,
      payloadMessage ?? `Hashavshevet is unavailable (${status}) for ${pathname}.`,
    );
  }

  return new ErpGatewayError(
    ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    payloadMessage ?? `Hashavshevet returned an unexpected response (${status}) for ${pathname}.`,
  );
}

function detectHConnectError(payload: unknown): ErpGatewayError | null {
  const message = detectHConnectErrorMessage(payload);
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes('missing') ||
    normalized.includes('failed to validate') ||
    normalized.includes('invalid json')
  ) {
    return new ErpGatewayError(ERP_ERROR_CODES.ERP_VALIDATION_FAILED, message);
  }

  if (
    normalized.includes('not allowed') ||
    normalized.includes('must consist') ||
    normalized.includes('authentication') ||
    normalized.includes('authorization')
  ) {
    return new ErpGatewayError(ERP_ERROR_CODES.ERP_AUTH_FAILED, message);
  }

  if (normalized.includes('not in service') || normalized.includes('failed to load')) {
    return new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, message);
  }

  return new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, message);
}

function detectHConnectErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    if (normalized.length === 0) {
      return null;
    }

    if (
      normalized.toLowerCase().includes('missing') ||
      normalized.toLowerCase().includes('invalid json') ||
      normalized.toLowerCase().includes('failed to validate') ||
      normalized.toLowerCase().includes('not in service') ||
      normalized.toLowerCase().includes('not allowed')
    ) {
      return normalized;
    }

    return null;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const candidate = detectHConnectErrorMessage(entry);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  const record = extractRecord(payload);
  if (!record) {
    return null;
  }

  const statusCandidate = readOptionalString(record, ['status', 'Status']);
  const isErrorStatus =
    statusCandidate !== null &&
    ['error', 'failed', 'invalid', 'not in service'].some((token) =>
      statusCandidate.toLowerCase().includes(token),
    );
  if (isErrorStatus) {
    return readOptionalString(record, ['message', 'Message', 'error', 'Error']) ?? statusCandidate;
  }

  return (
    readOptionalString(record, ['error', 'Error']) ??
    readOptionalString(record, ['message', 'Message']) ??
    null
  );
}

function normalizeHealthStatus(rawStatus: string | null): ErpGatewayHealth['status'] {
  if (!rawStatus) {
    return 'up';
  }

  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === 'up' || normalized === 'healthy' || normalized === 'ok') {
    return 'up';
  }

  if (normalized === 'degraded' || normalized === 'warning') {
    return 'degraded';
  }

  return 'down';
}

function normalizeUnit(rawUnit: string): 'kg' {
  void rawUnit;
  return 'kg';
}

function resolveSyncedAt(payload: unknown): string {
  const record = extractRecord(payload);
  if (!record) {
    return new Date().toISOString();
  }

  const explicit = readOptionalString(record, ['syncedAt', 'updatedAt', 'timestamp']);
  return normalizeIsoTimestamp(explicit, new Date().toISOString());
}

function normalizeIsoTimestamp(rawValue: string | null, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const timestamp = Date.parse(rawValue);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString();
}

function normalizeHConnectReportResponse(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = extractRecord(payload);
  if (!record) {
    return payload;
  }

  const wrappedRecord = extractNestedRecord(record, ['message', 'result', 'response']) ?? record;

  const directArray = findArrayCandidate(wrappedRecord, ['data', 'rows', 'records', 'pluginData']);
  if (directArray !== null) {
    return directArray;
  }

  return wrappedRecord;
}

function findArrayCandidate(record: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function extractNestedRecord(
  record: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const nested = extractRecord(record[key]);
    if (nested) {
      return nested;
    }

    const nestedString = record[key];
    if (typeof nestedString === 'string' && nestedString.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(nestedString) as unknown;
        const parsedRecord = extractRecord(parsed);
        if (parsedRecord) {
          return parsedRecord;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function mapPayloadArrayLoose(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      const record = extractRecord(entry);
      return record ? [record] : [];
    });
  }

  const record = extractRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate.flatMap((entry) => {
      const mappedRecord = extractRecord(entry);
      return mappedRecord ? [mappedRecord] : [];
    });
  }

  return [];
}

function mapPayloadArray(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((entry) => assertRecord(entry, 'Hashavshevet array entry'));
  }

  const record = assertRecord(payload, 'Hashavshevet response');
  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate.map((entry) => assertRecord(entry, `Hashavshevet ${key} entry`));
  }

  throw new ErpGatewayError(
    ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    `Hashavshevet payload must include one of: ${keys.join(', ')}.`,
  );
}

function extractPrimaryRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const record = extractRecord(entry);
      if (record) {
        return record;
      }
    }

    return null;
  }

  return extractRecord(value);
}

function parseAndApplyTemplate(template: string, vars: Record<string, string>): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch (error) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `Invalid HASH_HCONNECT report params JSON template: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  const applied = applyTemplateVars(parsed, vars);
  if (!Array.isArray(applied)) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      'HASH_HCONNECT report params template must resolve to a JSON array.',
    );
  }

  return applied;
}

function applyTemplateVars(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replaceAll(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => vars[key] ?? '');
  }

  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplateVars(entry, vars));
  }

  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = applyTemplateVars(nested, vars);
    }
    return output;
  }

  return value;
}

function buildDefaultParamData(value: string): unknown[] {
  return [
    {
      p_name: '_MUSTACH_P0_',
      id: '0',
      type: 'text',
      name: 'dynamic parameter',
      defVal: `'${value}'`,
      opName: '=',
      opOrigin: 'from',
    },
  ];
}

function extractRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  const record = extractRecord(value);
  if (!record) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `${label} must be a JSON object.`,
    );
  }

  return record;
}

function readRequiredString(
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string {
  const value = readOptionalString(record, keys);
  if (!value) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `Hashavshevet payload is missing required ${label}.`,
    );
  }

  return value;
}

function readOptionalIdentifier(record: Record<string, unknown>, keys: string[]): string | null {
  const fromString = readOptionalString(record, keys);
  if (fromString) {
    return fromString;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return null;
}

function readOptionalString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function readOptionalBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'number') {
      if (candidate === 1) {
        return true;
      }

      if (candidate === 0) {
        return false;
      }
    }

    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (['true', 't', 'yes', 'y', '1', 'active'].includes(normalized)) {
        return true;
      }

      if (['false', 'f', 'no', 'n', '0', 'inactive'].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}

function readRequiredNumber(record: Record<string, unknown>, keys: string[], label: string): number {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new ErpGatewayError(
    ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    `Hashavshevet payload is missing required numeric ${label}.`,
  );
}

function readOptionalNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function interpolatePath(pathTemplate: string, params: Record<string, string>): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (!value) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
        `Hashavshevet path parameter "${key}" is required.`,
      );
    }

    return encodeURIComponent(value);
  });
}
