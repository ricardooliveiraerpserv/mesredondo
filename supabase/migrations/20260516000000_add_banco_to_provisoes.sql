-- Adiciona coluna banco em mf_provisoes
-- Necessária porque o app agora exige banco em toda provisão (decisão 2026-05-16).
-- Sem essa coluna, o INSERT silenciosamente descartava o campo banco e o
-- LOAD trazia provs sem banco, que o filtro novo rejeita → orçamento ficava vazio.

alter table "public"."mf_provisoes"
  add column if not exists "banco" text;

create index if not exists idx_prov_user_banco
  on public.mf_provisoes (user_id, banco);
