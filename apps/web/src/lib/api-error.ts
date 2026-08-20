import { apiErrorSchema, type ApiErrorCode } from '@data-room/contracts';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const safeMessages: Partial<Record<ApiErrorCode, string>> = {
  AUTH_REQUIRED: 'Your session has expired. Please sign in again.',
  ACCESS_DENIED: 'You do not have access to this resource.',
  REGISTRATION_CLOSED: 'Registration is currently closed.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  RESOURCE_GONE: 'The requested resource is no longer available.',
  RATE_LIMITED: 'Too many requests. Please try again shortly.',
};

export function mapApiError(
  response: Response,
  body: unknown,
  fallbackRequestId?: string,
): ApiClientError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiClientError(
      parsed.data.error.code,
      safeMessages[parsed.data.error.code] ?? 'The request could not be completed.',
      response.status,
      parsed.data.error.requestId,
    );
  }

  return new ApiClientError(
    'INTERNAL_ERROR',
    'The service returned an unexpected error.',
    response.status,
    response.headers.get('X-Request-Id') ?? fallbackRequestId,
  );
}
