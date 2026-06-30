-- ⚔️ Guerra à Dívida — persistência com integridade.
-- Regra: NUNCA guardar saldo; saldo = saldo_inicial - SUM(transacoes.valor).

create extension if not exists pgcrypto;

-- Config (1 linha por usuário)
create table if not exists public.mf_guerra (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  saldo_inicial numeric not null default 37000,
  meta_semanas  int     not null default 4,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

-- Transações (VENDA | PAGAMENTO) — ambas ABATEM a dívida
create table if not exists public.mf_guerra_transacoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('VENDA','PAGAMENTO')),
  descricao  text,
  valor      numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_guerra_tx_user on public.mf_guerra_transacoes(user_id, created_at);

-- RLS: cada usuário só enxerga/mexe no que é dele
alter table public.mf_guerra            enable row level security;
alter table public.mf_guerra_transacoes enable row level security;

drop policy if exists guerra_owner    on public.mf_guerra;
drop policy if exists guerra_tx_owner on public.mf_guerra_transacoes;

create policy guerra_owner on public.mf_guerra
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy guerra_tx_owner on public.mf_guerra_transacoes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
