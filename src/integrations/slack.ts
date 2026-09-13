import {
  SlackApprovalRequestInputSchema,
  SlackInspectionInputSchema,
  SlackReceiptInputSchema,
  SlackProviderStateSchema,
  SlackSanitizedResultSchema,
  type SlackProviderAdapter as SlackProviderAdapterContract,
  type SlackProviderState,
  type SlackSanitizedResult,
} from '../providers/contracts/slack';

type SlackMessage = { text: string; ts: string; user?: string };
type SlackFetch = typeof fetch;

export type SlackAdapterConfig = { botToken: string; channelId: string; approverUserId: string; accountMode?: 'TEST' };

export class SlackAdapterError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'SlackAdapterError'; }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

function parseMessages(payload: unknown): SlackMessage[] {
  if (!record(payload) || !Array.isArray(payload.messages)) return [];
  return payload.messages.flatMap((item): SlackMessage[] => {
    if (!record(item) || typeof item.text !== 'string' || typeof item.ts !== 'string') return [];
    return [{ text: item.text, ts: item.ts, ...(typeof item.user === 'string' ? { user: item.user } : {}) }];
  });
}

export class SlackProviderAdapter implements SlackProviderAdapterContract {
  private readonly config: SlackAdapterConfig;
  private readonly fetchImpl: SlackFetch;

  constructor(config: SlackAdapterConfig, fetchImpl: SlackFetch = fetch) {
    if (!/^xoxb-/.test(config.botToken) || !config.channelId || !config.approverUserId) throw new SlackAdapterError('INVALID_CONFIG', 'Slack adapter configuration is incomplete.');
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async inspect(input: Parameters<SlackProviderAdapterContract['inspect']>[0]): Promise<SlackProviderState> {
    const parsed = SlackInspectionInputSchema.safeParse(input);
    if (!parsed.success || parsed.data.accountMode !== 'TEST' || parsed.data.channelId !== this.config.channelId) throw new SlackAdapterError('INVALID_INPUT', 'Slack inspection requires the configured TEST channel.');
    const messages = await this.history();
    const approval = messages.find((message) => /^APPROVE\s+\S+$/.test(message.text.trim()) && message.user === this.config.approverUserId);
    const receipt = messages.some((message) => message.text.includes('AMENDS_RECOVERY_RECEIPT'));
    return SlackProviderStateSchema.parse({
      provider: 'Slack', accountMode: 'TEST', channelId: this.config.channelId, approverUserId: this.config.approverUserId,
      originalInstructionAvailable: messages.some((message) => message.text.includes('Launch the Pro 2027 plan')),
      currentRunCode: approval ? approval.text.trim().slice('APPROVE '.length) : null,
      recoveryReceiptExists: receipt, readAt: new Date().toISOString(),
    });
  }

  async requestApproval(input: Parameters<SlackProviderAdapterContract['requestApproval']>[0]): Promise<SlackSanitizedResult> {
    const parsed = SlackApprovalRequestInputSchema.safeParse(input);
    if (!parsed.success || parsed.data.approverUserId !== this.config.approverUserId) throw new SlackAdapterError('INVALID_INPUT', 'Slack approval request input is invalid.');
    await this.post(`Amends recovery approval requested for ${parsed.data.runCode}. Reply with APPROVE ${parsed.data.runCode} only after reviewing the allowlisted plan.`);
    return this.result('SUCCEEDED', `approval-${parsed.data.runCode}`);
  }

  async postAllowlistedRecoveryReceipt(input: Parameters<SlackProviderAdapterContract['postAllowlistedRecoveryReceipt']>[0]): Promise<SlackSanitizedResult> {
    const parsed = SlackReceiptInputSchema.safeParse(input);
    if (!parsed.success || parsed.data.channelId !== this.config.channelId) throw new SlackAdapterError('INVALID_INPUT', 'Slack receipt input is invalid.');
    const marker = `AMENDS_RECOVERY_RECEIPT ${parsed.data.runCode}`;
    if ((await this.history()).some((message) => message.text.trim() === marker)) return this.result('SKIPPED', `receipt-${parsed.data.runCode}`, true);
    await this.post(`${marker} · Recovery completed after approval ${parsed.data.runCode}.`);
    return this.result('SUCCEEDED', `receipt-${parsed.data.runCode}`);
  }

  async verifyReread(input: Parameters<SlackProviderAdapterContract['verifyReread']>[0]): Promise<SlackProviderState> { return this.inspect(input); }

  async readOriginalInstruction(): Promise<SlackMessage> {
    const found = (await this.history()).find((message) => message.text.includes('Launch the Pro 2027 plan'));
    if (!found) throw new SlackAdapterError('INSTRUCTION_NOT_FOUND', 'The Amends instruction was not found in the configured channel.');
    return found;
  }

  async findApproval(runCode: string): Promise<{ approved: boolean; messageTs?: string }> {
    const found = (await this.history()).find((message) => message.text.trim() === `APPROVE ${runCode}` && message.user === this.config.approverUserId);
    return found ? { approved: true, messageTs: found.ts } : { approved: false };
  }

  private async history(): Promise<SlackMessage[]> {
    const payload = await this.request('conversations.history', 'GET', { channel: this.config.channelId, limit: '100' });
    return parseMessages(payload);
  }

  private async post(text: string): Promise<void> { await this.request('chat.postMessage', 'POST', { channel: this.config.channelId, text }); }

  private async request(method: string, httpMethod: 'GET' | 'POST', params: Record<string, string>): Promise<unknown> {
    const url = new URL(`https://slack.com/api/${method}`);
    const init: RequestInit = { method: httpMethod, headers: { Authorization: `Bearer ${this.config.botToken}`, 'Content-Type': 'application/json' }, cache: 'no-store' };
    if (httpMethod === 'GET') Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    else init.body = JSON.stringify(params);
    const response = await this.fetchImpl(url, init);
    const payload: unknown = await response.json();
    if (!response.ok || !record(payload) || payload.ok !== true) throw new SlackAdapterError(record(payload) && typeof payload.error === 'string' ? payload.error : 'UNKNOWN_ERROR', 'Slack request failed.');
    return payload;
  }

  private result(status: SlackSanitizedResult['status'], resultId: string, verified = true): SlackSanitizedResult {
    return SlackSanitizedResultSchema.parse({ provider: 'Slack', actionType: 'POST_SLACK_RECOVERY_RECEIPT', status, resultId, verified, readAt: new Date().toISOString() });
  }
}

export function createSlackProviderAdapter(config: SlackAdapterConfig, fetchImpl?: SlackFetch): SlackProviderAdapterContract { return new SlackProviderAdapter(config, fetchImpl); }
