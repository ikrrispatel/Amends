import { NextResponse } from 'next/server';
import { SlackProviderAdapter } from '../../../../integrations/slack';

function adapter() { return new SlackProviderAdapter({ botToken: process.env.SLACK_BOT_TOKEN ?? '', channelId: process.env.SLACK_CHANNEL_ID ?? '', approverUserId: process.env.SLACK_APPROVER_USER_ID ?? '' }); }

export async function GET() {
  try { const message = await adapter().readOriginalInstruction(); return NextResponse.json({ ok: true, instruction: { text: message.text, timestamp: message.ts } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Slack instruction unavailable.' }, { status: 502 }); }
}
