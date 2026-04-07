export type DependencyHealthStatus = 'up' | 'degraded' | 'down';

export type DependencyStatus = {
  status: DependencyHealthStatus;
  required: boolean;
  detail: string;
  latencyMs?: number;
};

export type ReadyConfig = {
  probeTimeoutMs: number;
  degradedLatencyMs: number;
  requiredMinimumStatus: 'degraded' | 'up';
};

export type ReadyProbe = {
  check(): Promise<Omit<DependencyStatus, 'required'>>;
};

export const READY_CONFIG = Symbol('READY_CONFIG');
export const POSTGRES_READY_PROBE = Symbol('POSTGRES_READY_PROBE');
export const REDIS_READY_PROBE = Symbol('REDIS_READY_PROBE');
export const ERP_READY_PROBE = Symbol('ERP_READY_PROBE');
