-- Soft delete para mf_lancamentos
-- Registros excluídos ficam no banco com deleted=true para uso da IA,
-- mas são filtrados no carregamento normal — import não os vê como duplicatas.

ALTER TABLE public.mf_lancamentos
  ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;

-- Índice parcial: acelera o filtro deleted=false que será usado em toda query normal
CREATE INDEX IF NOT EXISTS idx_lanc_not_deleted
  ON public.mf_lancamentos (user_id, mes, ano)
  WHERE deleted = false;
