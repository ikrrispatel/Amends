import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDemoRunRecord } from '@/domain/demo-run-repository';
import { PostgresDemoRunRepository } from './postgres-demo-run-repository';

test('Neon persistence integration: reconnect, actions, idempotency, and audit order', { skip: !process.env.DATABASE_URL }, async () => {
  const runId = `neon-test-${randomUUID()}`;
  const first = new PostgresDemoRunRepository();
  await first.migrate();
  const record = createDemoRunRecord({ runId, currentState: 'CREATED', executedActionIds: ['action-1'], plan: null });
  await first.create(record);
  await first.recordAction('idempotency-neon-test-001', runId, { actionId: 'action-1', status: 'SUCCEEDED' });
  await first.recordAction('idempotency-neon-test-001', runId, { actionId: 'action-1', status: 'SUCCEEDED' });
  await first.appendAuditEvent({ eventType: 'INSPECTION_STARTED', runId, sequence: 0, occurredAt: '2026-09-13T20:00:00.000Z', metadata: { fromState: 'CREATED', toState: 'INSPECTING' } });
  await first.appendAuditEvent({ eventType: 'VERIFICATION_PASSED', runId, sequence: 1, occurredAt: '2026-09-13T20:01:00.000Z', metadata: { checkCount: 3 } });
  await first.close();

  const second = new PostgresDemoRunRepository();
  const reconnected = await second.get(runId);
  assert.equal(reconnected?.runId, runId);
  assert.deepEqual(reconnected?.executedActionIds, ['action-1']);
  assert.deepEqual((await second.listAuditEvents(runId)).map((event) => event.sequence), [0, 1]);
  await second.delete(runId);
  await second.close();
});
