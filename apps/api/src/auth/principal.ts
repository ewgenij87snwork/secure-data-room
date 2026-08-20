const authenticatedPrincipalBrand: unique symbol = Symbol('AuthenticatedPrincipal');

export type AuthenticatedPrincipal = Readonly<{
  readonly [authenticatedPrincipalBrand]: true;
  kind: 'authenticated';
  userId: string;
  email: string;
}>;

export function authenticatedPrincipal(userId: string, email: string): AuthenticatedPrincipal {
  const principal = Object.defineProperty(
    { kind: 'authenticated' as const, userId, email },
    authenticatedPrincipalBrand,
    { value: true, enumerable: false, writable: false, configurable: false },
  ) as AuthenticatedPrincipal;
  return Object.freeze(principal);
}

export function isAuthenticatedPrincipal(value: unknown): value is AuthenticatedPrincipal {
  if (typeof value !== 'object' || value === null || !Object.isFrozen(value)) return false;
  return (
    Reflect.get(value, authenticatedPrincipalBrand) === true &&
    Reflect.get(value, 'kind') === 'authenticated' &&
    typeof Reflect.get(value, 'userId') === 'string' &&
    typeof Reflect.get(value, 'email') === 'string'
  );
}
