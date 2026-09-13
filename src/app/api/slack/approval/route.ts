import { NextResponse } from 'next/server';
import { SlackProviderAdapter } from '../../../../integrations/slack';

export async function GET(request: Request) {
  const runCode = new URL(request.url).searchParams.get('runCode')?.trim();
  if (!runCode || !/^[A-Z0-9-]{1,128}$/.test(runCode)) return NextResponse.json({ ok: false, error: 'A valid run code is required.' }, { status: 400 });
  try {
    const channelId = process.env.SLACK_CHANNEL_ID ?? '';
    const adapter = new SlackProviderAdapter({ botToken: process.env.SLACK_BOT_TOKEN ?? '', channelId, approverUserId: process.env.SLACK_APPROVER_USER_ID ?? '' });
    return NextResponse.json({ ok: true, ...(await adapter.findApproval(runCode)) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Slack approval status unavailable.' }, { status: 502 }); }
}
