import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';

// Per-1M-token pricing (USD). Keep in sync with docs/08-cost-estimate.md.
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'gpt-4o': { in: 2.5, out: 10 },
};

export type LlmPurpose =
  | 'jd_extract' | 'score' | 'resume' | 'cover' | 'recruiter_msg' | 'custom_answers' | 'report';

interface CallOpts {
  purpose: LlmPurpose;
  prompt: string;          // name of the file in prompts/ (without .md) OR raw text
  vars?: Record<string, string>;
  fast?: boolean;          // route to Haiku
  json?: boolean;          // expect/parse JSON
  jobId?: string;
  maxTokens?: number;
  think?: boolean;         // adaptive thinking for quality-critical generation
}

@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name);
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private readonly openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  private readonly promptDir = process.env.PROMPT_DIR ?? './prompts';

  constructor(private readonly prisma: PrismaService) {}

  private loadPrompt(name: string, vars: Record<string, string> = {}): string {
    // name may be a prompt file (jd-extraction) or already-inlined text
    let text = name;
    try {
      text = readFileSync(resolve(this.promptDir, `${name}.md`), 'utf-8');
    } catch {
      /* treat `name` as raw prompt text */
    }
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{{${k}}}`, v ?? '');
    }
    return text;
  }

  /** Single entry point. Tries Claude, falls back to OpenAI, logs cost. */
  async call(opts: CallOpts): Promise<{ text: string; json?: any }> {
    const filled = this.loadPrompt(opts.prompt, opts.vars);
    const model = opts.fast
      ? (process.env.ANTHROPIC_MODEL_FAST ?? 'claude-haiku-4-5-20251001')
      : (process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8');
    const maxTokens = opts.maxTokens ?? (opts.fast ? 1500 : 4000);

    try {
      const out = await this.callClaude(model, filled, maxTokens, opts.think);
      await this.logUsage(opts, 'claude', model, out.tokensIn, out.tokensOut);
      return this.finish(out.text, opts.json);
    } catch (e: any) {
      this.log.warn(`Claude failed (${e.message}); falling back to OpenAI`);
      if (!this.openai) throw e;
      const out = await this.callOpenAI(filled, maxTokens);
      await this.logUsage(opts, 'openai', process.env.OPENAI_MODEL ?? 'gpt-4o', out.tokensIn, out.tokensOut);
      return this.finish(out.text, opts.json);
    }
  }

  private async callClaude(model: string, prompt: string, maxTokens: number, think?: boolean) {
    const res = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(think ? { thinking: { type: 'adaptive' as const } } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
  }

  private async callOpenAI(prompt: string, maxTokens: number) {
    const res = await this.openai!.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
    };
  }

  /** Parse JSON, with one self-heal retry handled by the caller if needed. */
  private finish(text: string, json?: boolean) {
    if (!json) return { text };
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
      return { text, json: JSON.parse(cleaned) };
    } catch {
      // last-ditch: extract the first {...} or [...] block
      const m = cleaned.match(/[[{][\s\S]*[\]}]/);
      return { text, json: m ? JSON.parse(m[0]) : null };
    }
  }

  private async logUsage(o: CallOpts, provider: string, model: string, tin: number, tout: number) {
    const p = PRICING[model] ?? { in: 0, out: 0 };
    const costUsd = (tin / 1e6) * p.in + (tout / 1e6) * p.out;
    await this.prisma.llmUsage.create({
      data: { purpose: o.purpose, provider, model, tokensIn: tin, tokensOut: tout, costUsd, jobId: o.jobId },
    }).catch(() => undefined);
  }
}
