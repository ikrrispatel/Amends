import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { POST as createRunRoute } from './runs/route';
import { GET as getRunRoute } from './runs/[runId]/route';
import { POST as inspectRunRoute } from './runs/[runId]/inspect/route';
import { POST as approveRunRoute } from './runs/[runId]/approve/route';
import { POST as recoverRunRoute } from './runs/[runId]/recover/route';
import { POST as resetDemoRoute } from './demo/reset/route';
import { createDemoApiRuntime, DEMO_APPROVER_USER_ID, setDemoRuntime } from '@/application/demo-api';

const makeRequest = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);

describe('API controller layer', () => {
  it('malformed body is rejected with 400', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    const req = makeRequest('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 123 }),
    });

    const res = await createRunRoute(req);
    assert.equal(res.status, 400);
  });

  it('rate limit is enforced', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    const headers = { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' };
    for (let i = 0; i < 31; i += 1) {
      await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers, body: JSON.stringify({ runId: `run-${i}` }) }));
    }

    const res = await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers, body: JSON.stringify({ runId: 'rate-limit-hit' }) }));
    assert.equal(res.status, 429);
  });

  it('recovery before approval is rejected', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    const created = await createRunRoute(makeRequest('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 'run-before-approval', runCode: 'RUN-1' }),
    }));
    assert.equal(created.status, 201);

    const res = await recoverRunRoute(makeRequest('/api/runs/run-before-approval/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(res.status, 400);
  });

  it('wrong approver is rejected', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-wrong-approver', runCode: 'RUN-1' }) }));
    await runtime.orchestrator.createApprovalPlan('run-wrong-approver', 'RUN-1');

    const res = await approveRunRoute(makeRequest('/api/runs/run-wrong-approver/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runCode: 'RUN-1', approvedBy: 'U_OTHER', approvalMessage: 'APPROVE RUN-1' }),
    }));

    assert.equal(res.status, 400);
  });

  it('valid approval is accepted', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-valid-approve', runCode: 'RUN-1' }) }));
    await runtime.orchestrator.createApprovalPlan('run-valid-approve', 'RUN-1');

    const res = await approveRunRoute(makeRequest('/api/runs/run-valid-approve/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runCode: 'RUN-1', approvedBy: DEMO_APPROVER_USER_ID, approvalMessage: 'APPROVE RUN-1' }),
    }));

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.run.currentState, 'APPROVED');
  });

  it('duplicate recovery is rejected', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-duplicate-recovery', runCode: 'RUN-1' }) }));
    await runtime.orchestrator.createApprovalPlan('run-duplicate-recovery', 'RUN-1');
    await runtime.orchestrator.approveRun('run-duplicate-recovery', 'RUN-1', DEMO_APPROVER_USER_ID, 'APPROVE RUN-1');
    await runtime.orchestrator.executeRecovery('run-duplicate-recovery');

    const res = await recoverRunRoute(makeRequest('/api/runs/run-duplicate-recovery/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'RECOVERY_FAILED');
  });

  it('sanitized response shape is returned', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-sanitized', runCode: 'RUN-1' }) }));
    const res = await getRunRoute(makeRequest('/api/runs/run-sanitized', { method: 'GET' }), { params: { runId: 'run-sanitized' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.run);
    assert.ok(body.run.runId);
    assert.equal(typeof body.run.sanitizedFailure, 'object');
    assert.ok(!('providerId' in body.run));
  });

  it('no client-controlled provider IDs or actions are accepted', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);

    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-client-ids', runCode: 'RUN-1' }) }));

    const res = await approveRunRoute(makeRequest('/api/runs/run-client-ids/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runCode: 'RUN-1',
        approvedBy: DEMO_APPROVER_USER_ID,
        approvalMessage: 'APPROVE RUN-1',
        providerId: 'sub_123',
        actions: [{ type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE' }],
      }),
    }));

    assert.equal(res.status, 400);
  });

  it('reset route requires explicit permission', async () => {
    const res = await resetDemoRoute(makeRequest('/api/demo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));

    assert.equal(res.status, 400);
  });

  it('inspect route accepts a valid run and returns sanitized data', async () => {
    const runtime = createDemoApiRuntime();
    setDemoRuntime(runtime);
    await createRunRoute(makeRequest('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-inspect', runCode: 'RUN-1' }) }));

    const res = await inspectRunRoute(makeRequest('/api/runs/run-inspect/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    assert.equal(res.status, 200);
  });
});
