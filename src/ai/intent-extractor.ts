import { z } from 'zod';

import {
  DEFAULT_OUTCOME_CONTRACT,
  IntentContractV1Schema,
  extractIntentContract,
  type IntentContractV1,
} from '../domain/orchestration';

export interface IntentExtractor {
  extract(rawInstruction: string): Promise<IntentContractV1>;
}

export type StructuredIntentRequest = {
  type: 'INTENT_EXTRACTION_V1';
  instructionText: string;
  schema: 'IntentContractV1';
};

export type StructuredIntentProvider = {
  extractStructuredIntent: (request: StructuredIntentRequest) => Promise<unknown>;
};

export class FixtureIntentExtractor implements IntentExtractor {
  async extract(rawInstruction: string): Promise<IntentContractV1> {
    if (typeof rawInstruction !== 'string') {
      throw new Error('Instruction text must be a string.');
    }

    return extractIntentContract(rawInstruction, undefined);
  }
}

export class OpenAIIntentExtractor implements IntentExtractor {
  constructor(
    private readonly client: StructuredIntentProvider | null = null,
    private readonly model: string = 'gpt-4o-mini',
  ) {}

  async extract(rawInstruction: string): Promise<IntentContractV1> {
    if (typeof rawInstruction !== 'string' || rawInstruction.trim().length === 0) {
      throw new Error('Intent extraction requires raw instruction text.');
    }

    if (!this.client) {
      throw new Error(
        'OpenAI SDK implementation is blocked: no structured client is configured. Use FixtureIntentExtractor for demo/tests; the real SDK integration is not available in this repo.',
      );
    }

    const request: StructuredIntentRequest = {
      type: 'INTENT_EXTRACTION_V1',
      instructionText: rawInstruction,
      schema: 'IntentContractV1',
    };

    const response = await this.client.extractStructuredIntent(request);
    const parsed = IntentContractV1Schema.safeParse(response);

    if (!parsed.success) {
      throw new Error(`Malformed model output rejected by IntentContractV1Schema: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  getModelName(): string {
    return this.model;
  }
}

export const IntentExtractorSchema = z.union([
  z.instanceof(FixtureIntentExtractor),
  z.instanceof(OpenAIIntentExtractor),
]);

export const DEMO_FALLBACK_CONTRACT = DEFAULT_OUTCOME_CONTRACT;
