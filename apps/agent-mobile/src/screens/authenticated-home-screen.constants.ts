import { MaterialIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import type { SupervisorCustomerStatus } from '@awawda/shared-types'

import { buildCandidateBaseUrls } from '../api/api-base-url-fallback'
import { API_BASE_URL } from '../config/env'
import { spacing } from '../theme/tokens'
import type { AgentDashboardTabId } from './agent-dashboard-presenter'

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

export const SLOW_NETWORK_THRESHOLD_MS = 1800

export const FIELD_TAB_ITEMS: Array<{
  id: AgentDashboardTabId
  label: string
  icon: MaterialIconName
}> = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'customers', label: 'לקוחות', icon: 'group' },
  { id: 'orders', label: 'הזמנות', icon: 'receipt' },
  { id: 'settings', label: 'הגדרות', icon: 'settings' },
]

export const SUPERVISOR_TAB_ITEMS: Array<{
  id: AgentDashboardTabId
  label: string
  icon: MaterialIconName
}> = [
  { id: 'supervisor', label: 'בקרה', icon: 'admin-panel-settings' },
  { id: 'settings', label: 'הגדרות', icon: 'settings' },
]

export type CustomerFilterId = 'all' | 'active' | 'needs_action' | 'pending_link'

export const CUSTOMER_FILTERS: Array<{ id: CustomerFilterId; label: string }> = [
  { id: 'all', label: 'הכל' },
  { id: 'active', label: 'פעיל' },
  { id: 'needs_action', label: 'דורש פעולה' },
  { id: 'pending_link', label: 'ממתין ללינק' },
]

export type OrderDateFilterId = 'all' | '7d' | '30d' | '90d'

export type SupervisorProfileDraft = {
  name: string
  contactName: string
  phone: string
  city: string
  notes: string
  status: SupervisorCustomerStatus
}

export type SupervisorCreateAgentDraft = {
  name: string
  phone: string
  email: string
  password: string
  role: 'field_agent' | 'supervisor'
}

export const ORDER_DATE_FILTERS: Array<{ id: OrderDateFilterId; label: string; days?: number }> = [
  { id: 'all', label: 'כל התקופה' },
  { id: '7d', label: '7 ימים', days: 7 },
  { id: '30d', label: '30 ימים', days: 30 },
  { id: '90d', label: '90 ימים', days: 90 },
]

export const SUPERVISOR_STATUS_OPTIONS: Array<{ value: SupervisorCustomerStatus; label: string }> = [
  { value: 'active', label: 'פעיל' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'on_hold', label: 'מושהה' },
]

export const SUPERVISOR_AGENT_ROLE_OPTIONS: Array<{ value: 'field_agent' | 'supervisor'; label: string }> = [
  { value: 'field_agent', label: 'סוכן שטח' },
  { value: 'supervisor', label: 'סופרווייזר' },
]

export type SupervisorWorkspaceTabId = 'overview' | 'customers' | 'agents' | 'audit'

export const SUPERVISOR_WORKSPACE_TABS: Array<{
  id: SupervisorWorkspaceTabId
  label: string
  icon: MaterialIconName
}> = [
  { id: 'overview', label: 'סקירה', icon: 'dashboard' },
  { id: 'customers', label: 'לקוחות', icon: 'storefront' },
  { id: 'agents', label: 'סוכנים', icon: 'manage-accounts' },
  { id: 'audit', label: 'יומן', icon: 'history' },
]

export const ORDERS_PAGE_SIZE = 6
export const TESTING_CUT_MIN_DIMENSION_PX = 512
export const CATALOG_GRID_GAP = spacing.sm
export const CATALOG_GRID_ROWS_PER_PAGE = 3
export const MOBILE_CATALOG_GRID_COLUMNS = 3
export const WIDE_CATALOG_GRID_COLUMNS = 4
export const TABLET_MIN_VIEWPORT_WIDTH = 768
export const TESTING_CUT_IMAGE_CACHE_BUSTER = 'testing-cuts-v4'
export const TESTING_IMAGE_BASE_URLS = buildCandidateBaseUrls(API_BASE_URL)
export const DEFAULT_CUSTOMER_PHONE = '054-000-0000'
export const BASE_VIEWPORT_WIDTH = 430
