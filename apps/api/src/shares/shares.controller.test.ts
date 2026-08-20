import { describe, expect, it, vi } from 'vitest';
import { SharesController } from './shares.controller.js';

describe('SharesController public boundary', () => {
  it('uses only X-Share-Token and delegates public subtree reads to policy-backed services', async () => {
    const principal = { targetNodeId: '11111111-1111-4111-8111-111111111111' };
    const resolvePublic = vi.fn().mockResolvedValue(principal);
    const reads = { getNode: vi.fn().mockResolvedValue({ id: principal.targetNodeId }) };
    const lists = { listChildren: vi.fn().mockResolvedValue({ items: [] }) };
    const nodes = { createViewUrl: vi.fn().mockResolvedValue({ url: 'signed' }) };
    const controller = new SharesController(
      { resolvePublic } as never,
      reads as never,
      lists as never,
      nodes as never,
    );

    await controller.root('canonical-token');
    await controller.children('canonical-token', principal.targetNodeId, {
      limit: 20,
    });
    await controller.view('canonical-token', principal.targetNodeId);

    expect(resolvePublic).toHaveBeenCalledTimes(3);
    expect(reads.getNode).toHaveBeenCalledWith(principal, principal.targetNodeId);
    expect(lists.listChildren).toHaveBeenCalledWith(principal, principal.targetNodeId, {
      limit: 20,
    });
    expect(nodes.createViewUrl).toHaveBeenCalledWith(principal, principal.targetNodeId);
  });
});
