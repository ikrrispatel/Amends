import { NextResponse } from 'next/server';
import { SlackProviderAdapter } from '../../../../integrations/slack';

export async function POST(request: Request) {
  const runCode = new URL(request.url).searchParams.get('runCode')?.trim();
  if (!runCode || !/^[A-Z0-9-]{1,128}$/.test(runCode)) return NextResponse.json({ ok: false, error: 'A valid run code is required.' }, { status: 400 });
  try {
    const approverUserId = process.env.SLACK_APPROVER_USER_ID ?? '';
    const result = await new SlackProviderAdapter({ botToken: process.env.SLACK_BOT_TOKEN ?? '', channelId: process.env.SLACK_CHANNEL_ID ?? '', approverUserId }).requestApproval({ runId: `ui-${runCode}`, runCode, approvalCommand: 'APPROVE', approverUserId, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    return NextResponse.json({ ok: true, result, message: `Approval request posted for ${runCode}.` });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Slack approval request failed.' }, { status: 502 }); }
}
