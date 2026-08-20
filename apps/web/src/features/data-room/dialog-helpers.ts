import { nodeNameSchema } from '@data-room/contracts';
import { ApiClientError } from '../../lib/api-error.js';

export function parseNodeName(value: string): string | null {
  const parsed = nodeNameSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function suggestedNodeName(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || error.code !== 'NAME_CONFLICT') return null;
  const suggestedName = error.details?.suggestedName;
  return typeof suggestedName === 'string' ? suggestedName : null;
}

export function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'NAME_CONFLICT') return 'An item with this name already exists here.';
    if (error.code === 'RESOURCE_GONE') return 'This item is no longer available.';
    if (error.code === 'ACCESS_DENIED') return 'You no longer have permission to change this item.';
    if (error.code === 'CONFLICT') return 'This item changed elsewhere. Refresh and try again.';
    if (error.code === 'VALIDATION_FAILED') return 'Use a valid name without slash characters.';
  }
  return 'The change could not be saved. Please try again.';
}

export function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}
