import {
  NotionExecutionContextSchema,
  NotionInspectionInputSchema,
  NotionProviderStateSchema,
  NotionSanitizedResultSchema,
  type NotionProviderAdapter as NotionProviderAdapterContract,
  type NotionProviderState,
  type NotionSanitizedResult,
} from '../providers/contracts/notion';

type NotionFetch = typeof fetch;
type Block = { id: string; text: string };
export type NotionAdapterConfig = { apiKey: string; pageId: string; accountMode?: 'TEST' };
export type PricingPolicy = { customer: string; quantity: number; scope: string; existingPrice: number; newPrice: number };

export class NotionAdapterError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'NotionAdapterError'; }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

function richText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.flatMap((item): string[] => {
    if (!record(item)) return [];
    if (record(item.text) && typeof item.text.content === 'string') return [item.text.content];
    if (typeof item.plain_text === 'string') return [item.plain_text];
    return [];
  }).join('');
}

function blockText(block: Record<string, unknown>): string {
  for (const value of Object.values(block)) if (record(value) && Array.isArray(value.rich_text)) return richText(value.rich_text);
  return '';
}

function parsePolicy(blocks: Block[]): PricingPolicy {
  const values = new Map<string, string>();
  blocks.flatMap((block) => block.text.split(/\r?\n/)).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator >= 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  });
  const number = (label: string) => {
    const value = Number(values.get(label)?.replace(/[^0-9]/g, ''));
    if (!Number.isInteger(value)) throw new NotionAdapterError('INVALID_POLICY', `Notion policy field is invalid: ${label}`);
    return value;
  };
  const money = (label: string) => { const value = number(label); return value < 1000 ? value * 100 : value; };
  return { customer: values.get('Customer') ?? '', quantity: number('Quantity'), scope: values.get('Scope') ?? '', existingPrice: money('Existing customer price'), newPrice: money('New customer price') };
}

export class NotionProviderAdapter implements NotionProviderAdapterContract {
  private readonly config: NotionAdapterConfig;
  private readonly fetchImpl: NotionFetch;
  private inspected: NotionProviderState | null = null;

  constructor(config: NotionAdapterConfig, fetchImpl: NotionFetch = fetch) {
    if (!config.apiKey || !config.pageId) throw new NotionAdapterError('INVALID_CONFIG', 'Notion adapter configuration is incomplete.');
    this.config = config; this.fetchImpl = fetchImpl;
  }

  async inspect(input: Parameters<NotionProviderAdapterContract['inspect']>[0]): Promise<NotionProviderState> {
    const parsed = NotionInspectionInputSchema.safeParse(input);
    if (!parsed.success || parsed.data.accountMode !== 'TEST' || parsed.data.pageId !== this.config.pageId) throw new NotionAdapterError('INVALID_INPUT', 'Notion inspection requires the configured TEST page.');
    const document = await this.readDocument();
    const policy = parsePolicy(document.blocks);
    const state = NotionProviderStateSchema.parse({ provider: 'Notion', accountMode: 'TEST', pageId: this.config.pageId, databaseId: document.databaseId, scope: policy.scope === 'new_customers_only' ? 'new_customers_only' : 'all_customers', existingPriceCents: policy.existingPrice, newCustomerPriceCents: policy.newPrice, propertyIds: { scope: this.findBlock(document.blocks, 'Scope'), existingPrice: this.findBlock(document.blocks, 'Existing customer price'), newCustomerPrice: this.findBlock(document.blocks, 'New customer price') }, readAt: new Date().toISOString() });
    this.inspected = state; return state;
  }

  async executeAllowlistedRecovery(context: Parameters<NotionProviderAdapterContract['executeAllowlistedRecovery']>[0]): Promise<NotionSanitizedResult> {
    const parsed = NotionExecutionContextSchema.safeParse(context);
    if (!parsed.success || parsed.data.accountMode !== 'TEST') throw new NotionAdapterError('INVALID_INPUT', 'Notion recovery requires TEST mode.');
    if (!this.inspected) throw new NotionAdapterError('PRECONDITION_FAILED', 'Notion recovery requires a prior inspection.');
    const current = await this.inspect({ provider: 'Notion', accountMode: 'TEST', pageId: this.config.pageId });
    if (current.scope !== this.inspected.scope || current.existingPriceCents !== this.inspected.existingPriceCents || current.newCustomerPriceCents !== this.inspected.newCustomerPriceCents) throw new NotionAdapterError('PRECONDITION_FAILED', 'Notion state changed after inspection.');
    if (current.scope === 'new_customers_only' && current.existingPriceCents === 9900 && current.newCustomerPriceCents === 12900) return this.result('SKIPPED', this.config.pageId);
    const document = await this.readDocument();
    const updates: Record<string, string> = { Scope: 'new_customers_only', 'Existing customer price': '$99', 'New customer price': '$129' };
    for (const [label, value] of Object.entries(updates)) {
      const block = document.blocks.find((candidate) => candidate.text.split(/\r?\n/).some((line) => line.startsWith(`${label}:`)));
      if (!block) throw new NotionAdapterError('INVALID_POLICY', `Notion policy field was not found: ${label}`);
      const updated = block.text.split(/\r?\n/).map((line) => line.startsWith(`${label}:`) ? `${label}: ${value}` : line).join('\n');
      await this.request(`/blocks/${block.id}`, 'PATCH', { paragraph: { rich_text: [{ type: 'text', text: { content: updated } }] } });
    }
    const reread = await this.verifyReread({ provider: 'Notion', accountMode: 'TEST', pageId: this.config.pageId });
    if (reread.scope !== 'new_customers_only' || reread.existingPriceCents !== 9900 || reread.newCustomerPriceCents !== 12900) throw new NotionAdapterError('PRECONDITION_FAILED', 'Notion recovery did not reach the trusted target state.');
    return this.result('SUCCEEDED', this.config.pageId);
  }

  async verifyReread(input: Parameters<NotionProviderAdapterContract['verifyReread']>[0]): Promise<NotionProviderState> { return this.inspect(input); }

  async readPricingPolicy(): Promise<PricingPolicy> { return parsePolicy((await this.readDocument()).blocks); }

  private async readDocument(): Promise<{ databaseId: string; blocks: Block[] }> {
    const page = await this.request(`/pages/${this.config.pageId}`, 'GET');
    const children = await this.request(`/blocks/${this.config.pageId}/children?page_size=100`, 'GET');
    const blocks = record(children) && Array.isArray(children.results) ? children.results.flatMap((item): Block[] => record(item) && typeof item.id === 'string' ? [{ id: item.id, text: blockText(item) }] : []).filter((block) => block.text.length > 0) : [];
    const parent = record(page) && record(page.parent) ? page.parent : null;
    const databaseId = parent && typeof parent.database_id === 'string' ? parent.database_id : this.config.pageId;
    return { databaseId, blocks };
  }

  private findBlock(blocks: Block[], label: string): string { const block = blocks.find((candidate) => candidate.text.split(/\r?\n/).some((line) => line.startsWith(`${label}:`))); return block?.id ?? this.config.pageId; }

  private async request(path: string, method: 'GET' | 'PATCH', body?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`https://api.notion.com/v1${path}`, { method, headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const payload: unknown = await response.json();
    if (!response.ok || !record(payload)) throw new NotionAdapterError(`HTTP_${response.status}`, 'Notion request failed.');
    return payload;
  }

  private result(status: NotionSanitizedResult['status'], resultId: string, verified = true): NotionSanitizedResult { return NotionSanitizedResultSchema.parse({ provider: 'Notion', actionType: 'RESTORE_NOTION_PRICING_POLICY', status, resultId, verified, readAt: new Date().toISOString() }); }
}

export function createNotionProviderAdapter(config: NotionAdapterConfig, fetchImpl?: NotionFetch): NotionProviderAdapterContract { return new NotionProviderAdapter(config, fetchImpl); }
