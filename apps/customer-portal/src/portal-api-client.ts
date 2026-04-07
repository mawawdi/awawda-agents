import type {
  CustomerOrderMismatchResponse,
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
  CustomerPortalDataResponse,
  CustomerSessionActivateResponse,
} from '@meatland/shared-types';

export type PortalRequestFailure =
  | 'invalid_token'
  | 'expired_token'
  | 'network'
  | 'server'
  | 'erp_unavailable'
  | 'order_mismatch'
  | 'idempotency_conflict';

export class PortalApiError extends Error {
  readonly mismatch?: CustomerOrderMismatchResponse;

  constructor(kind: PortalRequestFailure, message: string, mismatch?: CustomerOrderMismatchResponse) {
    super(message);
    this.name = 'PortalApiError';
    this.kind = kind;
    this.mismatch = mismatch;
  }

  readonly kind: PortalRequestFailure;
}

export class PortalApiClient {
  constructor(
    private readonly baseUrl = '/v1',
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async activateSession(token: string): Promise<CustomerSessionActivateResponse> {
    const response = await this.request('/customer/sessions/activate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new PortalApiError('invalid_token', 'Activation token is invalid');
      }

      if (response.status === 410) {
        throw new PortalApiError('expired_token', 'Activation token has expired');
      }

      throw new PortalApiError('server', 'Activation request failed');
    }

    return (await response.json()) as CustomerSessionActivateResponse;
  }

  async getPortalData(sessionToken: string): Promise<CustomerPortalDataResponse> {
    const response = await this.request('/customer/portal-data', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        const authErrorCode = await this.readErrorCode(response);
        if (authErrorCode === 'AUTH_CUSTOMER_SESSION_EXPIRED') {
          throw new PortalApiError('expired_token', 'Customer session expired');
        }
        throw new PortalApiError('invalid_token', 'Customer session token invalid');
      }
      throw new PortalApiError('server', 'Portal data request failed');
    }

    return (await response.json()) as CustomerPortalDataResponse;
  }

  async submitOrder(
    sessionToken: string,
    idempotencyKey: string,
    request: CustomerOrderSubmitRequest,
  ): Promise<CustomerOrderSubmitResponse> {
    const response = await this.request('/customer/orders', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(request),
    });

    if (response.status === 409) {
      const body = (await response.json()) as CustomerOrderMismatchResponse | { code?: string };
      if (body && body.code === 'ORDER_LINES_MISMATCH' && 'lines' in body) {
        throw new PortalApiError('order_mismatch', 'Order lines mismatch current ERP pricing', body);
      }

      throw new PortalApiError('idempotency_conflict', 'Duplicate submission key cannot be reused with another payload');
    }

    if (!response.ok) {
      if (response.status === 401) {
        const authErrorCode = await this.readErrorCode(response);
        if (authErrorCode === 'AUTH_CUSTOMER_SESSION_EXPIRED') {
          throw new PortalApiError('expired_token', 'Customer session expired');
        }
        throw new PortalApiError('invalid_token', 'Customer session token invalid');
      }
      if (response.status === 503) {
        const errorCode = await this.readErrorCode(response);
        if (errorCode === 'CUSTOMER_ORDER_ERP_UNAVAILABLE') {
          throw new PortalApiError('erp_unavailable', 'ERP is temporarily unavailable for order submission');
        }
      }
      throw new PortalApiError('server', 'Order submit request failed');
    }

    return (await response.json()) as CustomerOrderSubmitResponse;
  }

  async logoutSession(sessionToken: string): Promise<void> {
    const response = await this.request('/customer/session/logout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok && response.status !== 401) {
      throw new PortalApiError('server', 'Session logout request failed');
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch {
      throw new PortalApiError('network', 'Network connection failed');
    }
  }

  private async readErrorCode(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { code?: unknown };
      return typeof body.code === 'string' ? body.code : null;
    } catch {
      return null;
    }
  }
}
