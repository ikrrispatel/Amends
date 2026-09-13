import assert from 'node:assert/strict';
import test from 'node:test';
import { SlackProviderAdapter } from './slack';

const input = { provider: 'Slack' as const, accountMode: 'TEST' as const, channelId: 'C_DEMO' };

test('Slack adapter accepts only the configured approver and exact approval command', async () => {
  const calls: string[] = [];
  const adapter = new SlackProviderAdapter({ botToken: 'xoxb-test', channelId: 'C_DEMO', approverUserId: 'U_APPROVER' }, async (url) => {
    calls.push(String(url));
    return Response.json({ ok: true, messages: [
      { text: 'APPROVE RUN-OTHER', user: 'U_APPROVER', ts: '1' },
      { text: 'APPROVE RUN-123 extra', user: 'U_APPROVER', ts: '2' },
      { text: 'APPROVE RUN-123', user: 'U_OTHER', ts: '3' },
      { text: 'APPROVE RUN-123', user: 'U_APPROVER', ts: '4' },
    ] });
  });
  const state = await adapter.inspect(input);
  assert.equal(state.currentRunCode, 'RUN-OTHER');
  assert.deepEqual(await adapter.findApproval('RUN-123'), { approved: true, messageTs: '4' });
  assert.equal(calls.length, 2);
});

test('Slack adapter prevents a duplicate recovery receipt', async () => {
  let posted = 0;
  const adapter = new SlackProviderAdapter({ botToken: 'xoxb-test', channelId: 'C_DEMO', approverUserId: 'U_APPROVER' }, async (url, init) => {
    if (init?.method === 'POST') { posted += 1; return Response.json({ ok: true }); }
    return Response.json({ ok: true, messages: [{ text: 'AMENDS_RECOVERY_RECEIPT RUN-123', ts: '1' }] });
  });
  const result = await adapter.postAllowlistedRecoveryReceipt({ runId: 'run-1', runCode: 'RUN-123', approvedAt: '2026-09-13T20:00:00.000Z', actionType: 'POST_SLACK_RECOVERY_RECEIPT', channelId: 'C_DEMO' });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(posted, 0);
});
