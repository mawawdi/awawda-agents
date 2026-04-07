import { createRoot } from 'react-dom/client';

import { CustomerPortalApp } from './customer-portal-routes';
import { PortalApiClient } from './portal-api-client';
import './customer-portal.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  const apiBaseUrl = (globalThis as { __CUSTOMER_PORTAL_API_BASE_URL__?: string }).__CUSTOMER_PORTAL_API_BASE_URL__;
  const apiClient = new PortalApiClient(apiBaseUrl ?? '/v1');
  createRoot(rootElement).render(<CustomerPortalApp apiClient={apiClient} />);
}
