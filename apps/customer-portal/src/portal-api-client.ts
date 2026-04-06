import type { CustomerPortalDataResponse, CustomerSessionActivateResponse } from '@meatland/shared-types';

export type PortalRequestFailure = 'invalid_token' | 'expired_token' | 'network' | 'server';

export class PortalApiError extends Error {
  constructor(readonly kind: PortalRequestFailure, message: string) {
    super(message);
    this.name = 'PortalApiError';
  }
}

export class PortalApiClient {
  constructor(
    private readonly baseUrl = '/v1',
    private readonly fetchImpl: typeof fetch = fetch,
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
      throw new PortalApiError('server', 'Portal data request failed');
    }

    return (await response.json()) as CustomerPortalDataResponse;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch {
      throw new PortalApiError('network', 'Network connection failed');
    }
  }
}
