import { NextResponse } from 'next/server';
import { NotionProviderAdapter } from '../../../../integrations/notion';

function adapter() { return new NotionProviderAdapter({ apiKey: process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY ?? '', pageId: process.env.NOTION_PAGE_ID ?? process.env.NOTION_PRICING_PAGE_ID ?? '' }); }

export async function GET() {
  try { return NextResponse.json({ ok: true, policy: await adapter().readPricingPolicy() }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Notion policy unavailable.' }, { status: 502 }); }
}
