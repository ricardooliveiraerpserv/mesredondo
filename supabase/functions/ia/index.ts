// ══════════════════════════════════════════════════════════════════════
// ia/index.ts — Edge Function: proxy para Anthropic Claude
//
// Contrato:
//   POST { prompt: string }
//   → 200 { text: string }
//   → 4xx/5xx { error: string }
//
// Variáveis de ambiente necessárias (Supabase → Settings → Edge Functions):
//   ANTHROPIC_API_KEY
// ══════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001'; // rápido e barato para categorização

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // ── Preflight CORS ─────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ── Apenas POST ───────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Lê o prompt ───────────────────────────────────────────────────
  let prompt: string;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Campo "prompt" ausente ou inválido');
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Chama Anthropic ───────────────────────────────────────────────
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'Anthropic API error: ' + anthropicRes.status, detail: err }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await anthropicRes.json();
    const text = data?.content?.[0]?.text ?? '';

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
