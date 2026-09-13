import assert from 'node:assert/strict';
import test from 'node:test';
import { NotionProviderAdapter } from './notion';

test('Notion adapter rereads and restores the frozen pricing policy', async () => {
  const values = { Customer: 'Northstar', Quantity: '87', Scope: 'all_customers', 'Existing customer price': '$129', 'New customer price': '$129' };
  const adapter = new NotionProviderAdapter({ apiKey: 'secret-test', pageId: 'page_demo' }, async (url, init) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { paragraph: { rich_text: [{ text: { content: string } }] } };
      body.paragraph.rich_text[0].text.content.split('\n').forEach((line) => { const index = line.indexOf(':'); if (index > 0) values[line.slice(0, index) as keyof typeof values] = line.slice(index + 1).trim(); });
      return Response.json({ id: 'updated' });
    }
    if (String(url).includes('/pages/')) return Response.json({ parent: { database_id: 'db_demo' } });
    return Response.json({ results: Object.entries(values).map(([label, value], index) => ({ id: `block-${index}`, paragraph: { rich_text: [{ plain_text: `${label}: ${value}` }] } })) });
  });
  const before = await adapter.inspect({ provider: 'Notion', accountMode: 'TEST', pageId: 'page_demo' });
  assert.equal(before.scope, 'all_customers');
  const result = await adapter.executeAllowlistedRecovery({ runId: 'run-1', actionId: 'notion-1', planHash: 'a'.repeat(64), idempotencyKey: 'recover-notion-001', approvedAt: '2026-09-13T20:00:00.000Z', accountMode: 'TEST' });
  assert.equal(result.status, 'SUCCEEDED');
  assert.deepEqual(values, { Customer: 'Northstar', Quantity: '87', Scope: 'new_customers_only', 'Existing customer price': '$99', 'New customer price': '$129' });
  const after = await adapter.verifyReread({ provider: 'Notion', accountMode: 'TEST', pageId: 'page_demo' });
  assert.equal(after.existingPriceCents, 9900);
});
