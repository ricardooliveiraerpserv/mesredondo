// ══════════════════════════════════════════════════════════════════════
// admin-set-password/index.ts — Edge Function
//
// Permite que um ADMIN redefina a senha de outro usuário.
// O endpoint /auth/v1/admin/* do GoTrue exige service_role, que não pode
// ficar no client; por isso a troca passa por aqui (igual ao delete-user).
//
// Contrato:
//   POST { user_id: string, password: string }
//   Authorization: Bearer <access_token do admin>
//   → 200 { ok: true }
//   → 4xx { error: string }
//
// Variáveis de ambiente (injetadas automaticamente pelo Supabase):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ══════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ── Identifica o chamador pelo access_token ───────────────────────
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return json({ error: 'Não autenticado.' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Confirma que o chamador é admin (mf_usuarios é a fonte de verdade) ─
  const { data: caller } = await admin
    .from('mf_usuarios')
    .select('role,ativo')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = caller?.role === 'admin' || user.user_metadata?.role === 'admin';
  if (!isAdmin)         return json({ error: 'Apenas administradores podem alterar senhas.' }, 403);
  if (caller?.ativo === false) return json({ error: 'Usuário admin desativado.' }, 403);

  // ── Lê e valida o corpo ───────────────────────────────────────────
  let user_id: string, password: string;
  try {
    const body = await req.json();
    user_id  = body?.user_id;
    password = body?.password;
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!user_id)            return json({ error: 'user_id ausente.' }, 400);
  if (!password || password.length < 6) return json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, 400);

  // ── Aplica a nova senha via Admin API ─────────────────────────────
  const { error } = await admin.auth.admin.updateUserById(user_id, { password });
  if (error) return json({ error: error.message }, 400);

  return json({ ok: true }, 200);
});
