export const ERP_ERROR_CODES = {
  ERP_UNAVAILABLE: 'ERP_UNAVAILABLE',
  ERP_TIMEOUT: 'ERP_TIMEOUT',
  ERP_AUTH_FAILED: 'ERP_AUTH_FAILED',
  ERP_VALIDATION_FAILED: 'ERP_VALIDATION_FAILED',
  ERP_NOT_IMPLEMENTED: 'ERP_NOT_IMPLEMENTED',
  ERP_ORDER_HANDOFF_FAILED: 'ERP_ORDER_HANDOFF_FAILED',
} as const;

export type ErpErrorCode = (typeof ERP_ERROR_CODES)[keyof typeof ERP_ERROR_CODES];

export class ErpGatewayError extends Error {
  readonly code: ErpErrorCode;
  readonly cause?: unknown;

  constructor(code: ErpErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ErpGatewayError';
    this.code = code;
    this.cause = cause;
  }
}

export function isErpGatewayError(error: unknown): error is ErpGatewayError {
  return error instanceof ErpGatewayError;
}
