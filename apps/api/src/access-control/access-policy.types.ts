import type { AuthenticatedPrincipal } from '../auth/principal.js';

const publicLinkPrincipalBrand: unique symbol = Symbol('PublicLinkPrincipal');

export type PublicLinkPrincipal = Readonly<{
  kind: 'public-link';
  shareId: string;
  targetNodeId: string;
  role: 'VIEWER';
  readonly [publicLinkPrincipalBrand]: true;
}>;

export type AccessPrincipal = AuthenticatedPrincipal | PublicLinkPrincipal;

export function publicLinkPrincipal(shareId: string, targetNodeId: string): PublicLinkPrincipal {
  if (!isUuid(shareId) || !isUuid(targetNodeId)) {
    throw new TypeError('Invalid public-link principal identifiers');
  }
  const principal: PublicLinkPrincipal = {
    kind: 'public-link',
    shareId,
    targetNodeId,
    role: 'VIEWER',
    [publicLinkPrincipalBrand]: true,
  };
  Object.defineProperty(principal, publicLinkPrincipalBrand, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(principal);
}

export function isPublicLinkPrincipal(value: unknown): value is PublicLinkPrincipal {
  if (typeof value !== 'object' || value === null || !Object.isFrozen(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 4 &&
    keys.every((key) => ['kind', 'shareId', 'targetNodeId', 'role'].includes(key)) &&
    Reflect.get(value, publicLinkPrincipalBrand) === true &&
    Reflect.get(value, 'kind') === 'public-link' &&
    isUuid(Reflect.get(value, 'shareId')) &&
    isUuid(Reflect.get(value, 'targetNodeId')) &&
    Reflect.get(value, 'role') === 'VIEWER'
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
