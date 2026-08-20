export function isFinalizeForClient(response: { clientId: string }, clientId: string): boolean {
  return response.clientId === clientId;
}
