
  create table "public"."lancamentos" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "descricao" text,
    "valor" numeric not null,
    "tipo" text,
    "data" date not null default CURRENT_DATE,
    "recorrente" boolean not null default false,
    "dia_recorrencia" integer
      );


alter table "public"."lancamentos" enable row level security;


  create table "public"."meufinanceiro_backup" (
    "id" uuid not null,
    "data" jsonb,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."meufinanceiro_backup" enable row level security;


  create table "public"."meufinanceiro_usuarios" (
    "id" uuid not null,
    "email" text,
    "name" text,
    "role" text default 'user'::text,
    "ativo" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."meufinanceiro_usuarios" enable row level security;


  create table "public"."mf_bancos" (
    "id" text not null,
    "user_id" uuid not null,
    "nome" text not null,
    "icone" text,
    "cor" text,
    "ativo" boolean default true,
    "ordem" integer default 0,
    "created_at" timestamp with time zone default now(),
    "saldo_inicial" numeric default 0,
    "saldo_data" text
      );


alter table "public"."mf_bancos" enable row level security;


  create table "public"."mf_categorias" (
    "id" text not null,
    "user_id" uuid not null,
    "nome" text not null,
    "tipo" text,
    "icone" text,
    "cor" text,
    "ordem" integer default 0,
    "subs" jsonb default '[]'::jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."mf_categorias" enable row level security;


  create table "public"."mf_config" (
    "user_id" uuid not null,
    "saldo_inicial" jsonb default '{"data": "", "valor": 0}'::jsonb,
    "banco_modo" text default 'consolidado'::text,
    "banco_consolid_ids" jsonb default '[]'::jsonb,
    "catmap" jsonb default '{}'::jsonb,
    "submap" jsonb default '{}'::jsonb,
    "cats_version" text default ''::text,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."mf_config" enable row level security;


  create table "public"."mf_lancamentos" (
    "id" text not null,
    "user_id" uuid not null,
    "tipo" text not null,
    "data" date,
    "valor" numeric(14,2),
    "descricao" text,
    "categoria" text,
    "sub_categoria" text,
    "status" text default 'pendente'::text,
    "pagamento" text,
    "tipo_lanc" text default 'unico'::text,
    "vencimento" date,
    "mes" smallint,
    "ano" smallint,
    "group_id" text,
    "recorr" text,
    "total_parcelas" smallint,
    "origem" text,
    "original_sign" text,
    "terceiro" text,
    "banco" text,
    "parc_atual" smallint,
    "parc_total" smallint,
    "_ts" bigint default ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."mf_lancamentos" enable row level security;


  create table "public"."mf_pagamentos" (
    "id" text not null,
    "user_id" uuid not null,
    "nome" text not null,
    "icone" text,
    "cor" text,
    "cartao" boolean default false,
    "dia_fechamento" smallint,
    "dia_vencimento" smallint,
    "ordem" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."mf_pagamentos" enable row level security;


  create table "public"."mf_provisoes" (
    "id" text not null,
    "user_id" uuid not null,
    "group_id" text,
    "categoria" text,
    "sub_categoria" text,
    "valor" numeric(14,2),
    "mes" smallint,
    "ano" smallint,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."mf_provisoes" enable row level security;


  create table "public"."mf_terceiros" (
    "id" text not null,
    "user_id" uuid not null,
    "nome" text not null,
    "obs" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."mf_terceiros" enable row level security;


  create table "public"."mf_tombstones" (
    "id" text not null,
    "user_id" uuid not null,
    "tabela" text not null default 'lancamentos'::text,
    "deleted_at" bigint not null
      );


alter table "public"."mf_tombstones" enable row level security;


  create table "public"."mf_usuarios" (
    "id" uuid not null,
    "email" text,
    "name" text,
    "role" text default 'user'::text,
    "ativo" boolean default true,
    "plan" text default 'free'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."mf_usuarios" enable row level security;

CREATE INDEX idx_lanc_group_id ON public.mf_lancamentos USING btree (user_id, group_id);

CREATE INDEX idx_lanc_user_mes_ano ON public.mf_lancamentos USING btree (user_id, mes, ano);

CREATE INDEX idx_lanc_user_status ON public.mf_lancamentos USING btree (user_id, status);

CREATE INDEX idx_lancamentos_recorrente ON public.lancamentos USING btree (user_id, recorrente) WHERE (recorrente = true);

CREATE INDEX idx_prov_user_mes_ano ON public.mf_provisoes USING btree (user_id, mes, ano);

CREATE INDEX idx_tomb_user ON public.mf_tombstones USING btree (user_id);

CREATE UNIQUE INDEX lancamentos_pkey ON public.lancamentos USING btree (id);

CREATE UNIQUE INDEX meufinanceiro_backup_pkey ON public.meufinanceiro_backup USING btree (id);

CREATE UNIQUE INDEX meufinanceiro_usuarios_pkey ON public.meufinanceiro_usuarios USING btree (id);

CREATE UNIQUE INDEX mf_bancos_pkey ON public.mf_bancos USING btree (id, user_id);

CREATE UNIQUE INDEX mf_categorias_pkey ON public.mf_categorias USING btree (id, user_id);

CREATE UNIQUE INDEX mf_config_pkey ON public.mf_config USING btree (user_id);

CREATE UNIQUE INDEX mf_lancamentos_pkey ON public.mf_lancamentos USING btree (id, user_id);

CREATE UNIQUE INDEX mf_pagamentos_pkey ON public.mf_pagamentos USING btree (id, user_id);

CREATE UNIQUE INDEX mf_provisoes_pkey ON public.mf_provisoes USING btree (id, user_id);

CREATE UNIQUE INDEX mf_terceiros_pkey ON public.mf_terceiros USING btree (id, user_id);

CREATE UNIQUE INDEX mf_tombstones_pkey ON public.mf_tombstones USING btree (id, user_id);

CREATE UNIQUE INDEX mf_usuarios_pkey ON public.mf_usuarios USING btree (id);

alter table "public"."lancamentos" add constraint "lancamentos_pkey" PRIMARY KEY using index "lancamentos_pkey";

alter table "public"."meufinanceiro_backup" add constraint "meufinanceiro_backup_pkey" PRIMARY KEY using index "meufinanceiro_backup_pkey";

alter table "public"."meufinanceiro_usuarios" add constraint "meufinanceiro_usuarios_pkey" PRIMARY KEY using index "meufinanceiro_usuarios_pkey";

alter table "public"."mf_bancos" add constraint "mf_bancos_pkey" PRIMARY KEY using index "mf_bancos_pkey";

alter table "public"."mf_categorias" add constraint "mf_categorias_pkey" PRIMARY KEY using index "mf_categorias_pkey";

alter table "public"."mf_config" add constraint "mf_config_pkey" PRIMARY KEY using index "mf_config_pkey";

alter table "public"."mf_lancamentos" add constraint "mf_lancamentos_pkey" PRIMARY KEY using index "mf_lancamentos_pkey";

alter table "public"."mf_pagamentos" add constraint "mf_pagamentos_pkey" PRIMARY KEY using index "mf_pagamentos_pkey";

alter table "public"."mf_provisoes" add constraint "mf_provisoes_pkey" PRIMARY KEY using index "mf_provisoes_pkey";

alter table "public"."mf_terceiros" add constraint "mf_terceiros_pkey" PRIMARY KEY using index "mf_terceiros_pkey";

alter table "public"."mf_tombstones" add constraint "mf_tombstones_pkey" PRIMARY KEY using index "mf_tombstones_pkey";

alter table "public"."mf_usuarios" add constraint "mf_usuarios_pkey" PRIMARY KEY using index "mf_usuarios_pkey";

alter table "public"."lancamentos" add constraint "lancamentos_tipo_check" CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text]))) not valid;

alter table "public"."lancamentos" validate constraint "lancamentos_tipo_check";

alter table "public"."meufinanceiro_backup" add constraint "meufinanceiro_backup_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."meufinanceiro_backup" validate constraint "meufinanceiro_backup_id_fkey";

alter table "public"."mf_bancos" add constraint "mf_bancos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_bancos" validate constraint "mf_bancos_user_id_fkey";

alter table "public"."mf_categorias" add constraint "mf_categorias_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_categorias" validate constraint "mf_categorias_user_id_fkey";

alter table "public"."mf_config" add constraint "mf_config_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_config" validate constraint "mf_config_user_id_fkey";

alter table "public"."mf_lancamentos" add constraint "mf_lancamentos_tipo_check" CHECK ((tipo = ANY (ARRAY['receita'::text, 'despesa'::text]))) not valid;

alter table "public"."mf_lancamentos" validate constraint "mf_lancamentos_tipo_check";

alter table "public"."mf_lancamentos" add constraint "mf_lancamentos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_lancamentos" validate constraint "mf_lancamentos_user_id_fkey";

alter table "public"."mf_pagamentos" add constraint "mf_pagamentos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_pagamentos" validate constraint "mf_pagamentos_user_id_fkey";

alter table "public"."mf_provisoes" add constraint "mf_provisoes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_provisoes" validate constraint "mf_provisoes_user_id_fkey";

alter table "public"."mf_terceiros" add constraint "mf_terceiros_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_terceiros" validate constraint "mf_terceiros_user_id_fkey";

alter table "public"."mf_tombstones" add constraint "mf_tombstones_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_tombstones" validate constraint "mf_tombstones_user_id_fkey";

alter table "public"."mf_usuarios" add constraint "mf_usuarios_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."mf_usuarios" validate constraint "mf_usuarios_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.mf_usuarios (id, email, name, role, ativo, plan)
  VALUES (NEW.id, COALESCE(NEW.email, ''), '', 'user', true, 'trial')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."lancamentos" to "anon";

grant insert on table "public"."lancamentos" to "anon";

grant references on table "public"."lancamentos" to "anon";

grant select on table "public"."lancamentos" to "anon";

grant trigger on table "public"."lancamentos" to "anon";

grant truncate on table "public"."lancamentos" to "anon";

grant update on table "public"."lancamentos" to "anon";

grant delete on table "public"."lancamentos" to "authenticated";

grant insert on table "public"."lancamentos" to "authenticated";

grant references on table "public"."lancamentos" to "authenticated";

grant select on table "public"."lancamentos" to "authenticated";

grant trigger on table "public"."lancamentos" to "authenticated";

grant truncate on table "public"."lancamentos" to "authenticated";

grant update on table "public"."lancamentos" to "authenticated";

grant delete on table "public"."lancamentos" to "service_role";

grant insert on table "public"."lancamentos" to "service_role";

grant references on table "public"."lancamentos" to "service_role";

grant select on table "public"."lancamentos" to "service_role";

grant trigger on table "public"."lancamentos" to "service_role";

grant truncate on table "public"."lancamentos" to "service_role";

grant update on table "public"."lancamentos" to "service_role";

grant delete on table "public"."meufinanceiro_backup" to "anon";

grant insert on table "public"."meufinanceiro_backup" to "anon";

grant references on table "public"."meufinanceiro_backup" to "anon";

grant select on table "public"."meufinanceiro_backup" to "anon";

grant trigger on table "public"."meufinanceiro_backup" to "anon";

grant truncate on table "public"."meufinanceiro_backup" to "anon";

grant update on table "public"."meufinanceiro_backup" to "anon";

grant delete on table "public"."meufinanceiro_backup" to "authenticated";

grant insert on table "public"."meufinanceiro_backup" to "authenticated";

grant references on table "public"."meufinanceiro_backup" to "authenticated";

grant select on table "public"."meufinanceiro_backup" to "authenticated";

grant trigger on table "public"."meufinanceiro_backup" to "authenticated";

grant truncate on table "public"."meufinanceiro_backup" to "authenticated";

grant update on table "public"."meufinanceiro_backup" to "authenticated";

grant delete on table "public"."meufinanceiro_backup" to "service_role";

grant insert on table "public"."meufinanceiro_backup" to "service_role";

grant references on table "public"."meufinanceiro_backup" to "service_role";

grant select on table "public"."meufinanceiro_backup" to "service_role";

grant trigger on table "public"."meufinanceiro_backup" to "service_role";

grant truncate on table "public"."meufinanceiro_backup" to "service_role";

grant update on table "public"."meufinanceiro_backup" to "service_role";

grant delete on table "public"."meufinanceiro_usuarios" to "anon";

grant insert on table "public"."meufinanceiro_usuarios" to "anon";

grant references on table "public"."meufinanceiro_usuarios" to "anon";

grant select on table "public"."meufinanceiro_usuarios" to "anon";

grant trigger on table "public"."meufinanceiro_usuarios" to "anon";

grant truncate on table "public"."meufinanceiro_usuarios" to "anon";

grant update on table "public"."meufinanceiro_usuarios" to "anon";

grant delete on table "public"."meufinanceiro_usuarios" to "authenticated";

grant insert on table "public"."meufinanceiro_usuarios" to "authenticated";

grant references on table "public"."meufinanceiro_usuarios" to "authenticated";

grant select on table "public"."meufinanceiro_usuarios" to "authenticated";

grant trigger on table "public"."meufinanceiro_usuarios" to "authenticated";

grant truncate on table "public"."meufinanceiro_usuarios" to "authenticated";

grant update on table "public"."meufinanceiro_usuarios" to "authenticated";

grant delete on table "public"."meufinanceiro_usuarios" to "service_role";

grant insert on table "public"."meufinanceiro_usuarios" to "service_role";

grant references on table "public"."meufinanceiro_usuarios" to "service_role";

grant select on table "public"."meufinanceiro_usuarios" to "service_role";

grant trigger on table "public"."meufinanceiro_usuarios" to "service_role";

grant truncate on table "public"."meufinanceiro_usuarios" to "service_role";

grant update on table "public"."meufinanceiro_usuarios" to "service_role";

grant delete on table "public"."mf_bancos" to "anon";

grant insert on table "public"."mf_bancos" to "anon";

grant references on table "public"."mf_bancos" to "anon";

grant select on table "public"."mf_bancos" to "anon";

grant trigger on table "public"."mf_bancos" to "anon";

grant truncate on table "public"."mf_bancos" to "anon";

grant update on table "public"."mf_bancos" to "anon";

grant delete on table "public"."mf_bancos" to "authenticated";

grant insert on table "public"."mf_bancos" to "authenticated";

grant references on table "public"."mf_bancos" to "authenticated";

grant select on table "public"."mf_bancos" to "authenticated";

grant trigger on table "public"."mf_bancos" to "authenticated";

grant truncate on table "public"."mf_bancos" to "authenticated";

grant update on table "public"."mf_bancos" to "authenticated";

grant delete on table "public"."mf_bancos" to "service_role";

grant insert on table "public"."mf_bancos" to "service_role";

grant references on table "public"."mf_bancos" to "service_role";

grant select on table "public"."mf_bancos" to "service_role";

grant trigger on table "public"."mf_bancos" to "service_role";

grant truncate on table "public"."mf_bancos" to "service_role";

grant update on table "public"."mf_bancos" to "service_role";

grant delete on table "public"."mf_categorias" to "anon";

grant insert on table "public"."mf_categorias" to "anon";

grant references on table "public"."mf_categorias" to "anon";

grant select on table "public"."mf_categorias" to "anon";

grant trigger on table "public"."mf_categorias" to "anon";

grant truncate on table "public"."mf_categorias" to "anon";

grant update on table "public"."mf_categorias" to "anon";

grant delete on table "public"."mf_categorias" to "authenticated";

grant insert on table "public"."mf_categorias" to "authenticated";

grant references on table "public"."mf_categorias" to "authenticated";

grant select on table "public"."mf_categorias" to "authenticated";

grant trigger on table "public"."mf_categorias" to "authenticated";

grant truncate on table "public"."mf_categorias" to "authenticated";

grant update on table "public"."mf_categorias" to "authenticated";

grant delete on table "public"."mf_categorias" to "service_role";

grant insert on table "public"."mf_categorias" to "service_role";

grant references on table "public"."mf_categorias" to "service_role";

grant select on table "public"."mf_categorias" to "service_role";

grant trigger on table "public"."mf_categorias" to "service_role";

grant truncate on table "public"."mf_categorias" to "service_role";

grant update on table "public"."mf_categorias" to "service_role";

grant delete on table "public"."mf_config" to "anon";

grant insert on table "public"."mf_config" to "anon";

grant references on table "public"."mf_config" to "anon";

grant select on table "public"."mf_config" to "anon";

grant trigger on table "public"."mf_config" to "anon";

grant truncate on table "public"."mf_config" to "anon";

grant update on table "public"."mf_config" to "anon";

grant delete on table "public"."mf_config" to "authenticated";

grant insert on table "public"."mf_config" to "authenticated";

grant references on table "public"."mf_config" to "authenticated";

grant select on table "public"."mf_config" to "authenticated";

grant trigger on table "public"."mf_config" to "authenticated";

grant truncate on table "public"."mf_config" to "authenticated";

grant update on table "public"."mf_config" to "authenticated";

grant delete on table "public"."mf_config" to "service_role";

grant insert on table "public"."mf_config" to "service_role";

grant references on table "public"."mf_config" to "service_role";

grant select on table "public"."mf_config" to "service_role";

grant trigger on table "public"."mf_config" to "service_role";

grant truncate on table "public"."mf_config" to "service_role";

grant update on table "public"."mf_config" to "service_role";

grant delete on table "public"."mf_lancamentos" to "anon";

grant insert on table "public"."mf_lancamentos" to "anon";

grant references on table "public"."mf_lancamentos" to "anon";

grant select on table "public"."mf_lancamentos" to "anon";

grant trigger on table "public"."mf_lancamentos" to "anon";

grant truncate on table "public"."mf_lancamentos" to "anon";

grant update on table "public"."mf_lancamentos" to "anon";

grant delete on table "public"."mf_lancamentos" to "authenticated";

grant insert on table "public"."mf_lancamentos" to "authenticated";

grant references on table "public"."mf_lancamentos" to "authenticated";

grant select on table "public"."mf_lancamentos" to "authenticated";

grant trigger on table "public"."mf_lancamentos" to "authenticated";

grant truncate on table "public"."mf_lancamentos" to "authenticated";

grant update on table "public"."mf_lancamentos" to "authenticated";

grant delete on table "public"."mf_lancamentos" to "service_role";

grant insert on table "public"."mf_lancamentos" to "service_role";

grant references on table "public"."mf_lancamentos" to "service_role";

grant select on table "public"."mf_lancamentos" to "service_role";

grant trigger on table "public"."mf_lancamentos" to "service_role";

grant truncate on table "public"."mf_lancamentos" to "service_role";

grant update on table "public"."mf_lancamentos" to "service_role";

grant delete on table "public"."mf_pagamentos" to "anon";

grant insert on table "public"."mf_pagamentos" to "anon";

grant references on table "public"."mf_pagamentos" to "anon";

grant select on table "public"."mf_pagamentos" to "anon";

grant trigger on table "public"."mf_pagamentos" to "anon";

grant truncate on table "public"."mf_pagamentos" to "anon";

grant update on table "public"."mf_pagamentos" to "anon";

grant delete on table "public"."mf_pagamentos" to "authenticated";

grant insert on table "public"."mf_pagamentos" to "authenticated";

grant references on table "public"."mf_pagamentos" to "authenticated";

grant select on table "public"."mf_pagamentos" to "authenticated";

grant trigger on table "public"."mf_pagamentos" to "authenticated";

grant truncate on table "public"."mf_pagamentos" to "authenticated";

grant update on table "public"."mf_pagamentos" to "authenticated";

grant delete on table "public"."mf_pagamentos" to "service_role";

grant insert on table "public"."mf_pagamentos" to "service_role";

grant references on table "public"."mf_pagamentos" to "service_role";

grant select on table "public"."mf_pagamentos" to "service_role";

grant trigger on table "public"."mf_pagamentos" to "service_role";

grant truncate on table "public"."mf_pagamentos" to "service_role";

grant update on table "public"."mf_pagamentos" to "service_role";

grant delete on table "public"."mf_provisoes" to "anon";

grant insert on table "public"."mf_provisoes" to "anon";

grant references on table "public"."mf_provisoes" to "anon";

grant select on table "public"."mf_provisoes" to "anon";

grant trigger on table "public"."mf_provisoes" to "anon";

grant truncate on table "public"."mf_provisoes" to "anon";

grant update on table "public"."mf_provisoes" to "anon";

grant delete on table "public"."mf_provisoes" to "authenticated";

grant insert on table "public"."mf_provisoes" to "authenticated";

grant references on table "public"."mf_provisoes" to "authenticated";

grant select on table "public"."mf_provisoes" to "authenticated";

grant trigger on table "public"."mf_provisoes" to "authenticated";

grant truncate on table "public"."mf_provisoes" to "authenticated";

grant update on table "public"."mf_provisoes" to "authenticated";

grant delete on table "public"."mf_provisoes" to "service_role";

grant insert on table "public"."mf_provisoes" to "service_role";

grant references on table "public"."mf_provisoes" to "service_role";

grant select on table "public"."mf_provisoes" to "service_role";

grant trigger on table "public"."mf_provisoes" to "service_role";

grant truncate on table "public"."mf_provisoes" to "service_role";

grant update on table "public"."mf_provisoes" to "service_role";

grant delete on table "public"."mf_terceiros" to "anon";

grant insert on table "public"."mf_terceiros" to "anon";

grant references on table "public"."mf_terceiros" to "anon";

grant select on table "public"."mf_terceiros" to "anon";

grant trigger on table "public"."mf_terceiros" to "anon";

grant truncate on table "public"."mf_terceiros" to "anon";

grant update on table "public"."mf_terceiros" to "anon";

grant delete on table "public"."mf_terceiros" to "authenticated";

grant insert on table "public"."mf_terceiros" to "authenticated";

grant references on table "public"."mf_terceiros" to "authenticated";

grant select on table "public"."mf_terceiros" to "authenticated";

grant trigger on table "public"."mf_terceiros" to "authenticated";

grant truncate on table "public"."mf_terceiros" to "authenticated";

grant update on table "public"."mf_terceiros" to "authenticated";

grant delete on table "public"."mf_terceiros" to "service_role";

grant insert on table "public"."mf_terceiros" to "service_role";

grant references on table "public"."mf_terceiros" to "service_role";

grant select on table "public"."mf_terceiros" to "service_role";

grant trigger on table "public"."mf_terceiros" to "service_role";

grant truncate on table "public"."mf_terceiros" to "service_role";

grant update on table "public"."mf_terceiros" to "service_role";

grant delete on table "public"."mf_tombstones" to "anon";

grant insert on table "public"."mf_tombstones" to "anon";

grant references on table "public"."mf_tombstones" to "anon";

grant select on table "public"."mf_tombstones" to "anon";

grant trigger on table "public"."mf_tombstones" to "anon";

grant truncate on table "public"."mf_tombstones" to "anon";

grant update on table "public"."mf_tombstones" to "anon";

grant delete on table "public"."mf_tombstones" to "authenticated";

grant insert on table "public"."mf_tombstones" to "authenticated";

grant references on table "public"."mf_tombstones" to "authenticated";

grant select on table "public"."mf_tombstones" to "authenticated";

grant trigger on table "public"."mf_tombstones" to "authenticated";

grant truncate on table "public"."mf_tombstones" to "authenticated";

grant update on table "public"."mf_tombstones" to "authenticated";

grant delete on table "public"."mf_tombstones" to "service_role";

grant insert on table "public"."mf_tombstones" to "service_role";

grant references on table "public"."mf_tombstones" to "service_role";

grant select on table "public"."mf_tombstones" to "service_role";

grant trigger on table "public"."mf_tombstones" to "service_role";

grant truncate on table "public"."mf_tombstones" to "service_role";

grant update on table "public"."mf_tombstones" to "service_role";

grant delete on table "public"."mf_usuarios" to "anon";

grant insert on table "public"."mf_usuarios" to "anon";

grant references on table "public"."mf_usuarios" to "anon";

grant select on table "public"."mf_usuarios" to "anon";

grant trigger on table "public"."mf_usuarios" to "anon";

grant truncate on table "public"."mf_usuarios" to "anon";

grant update on table "public"."mf_usuarios" to "anon";

grant delete on table "public"."mf_usuarios" to "authenticated";

grant insert on table "public"."mf_usuarios" to "authenticated";

grant references on table "public"."mf_usuarios" to "authenticated";

grant select on table "public"."mf_usuarios" to "authenticated";

grant trigger on table "public"."mf_usuarios" to "authenticated";

grant truncate on table "public"."mf_usuarios" to "authenticated";

grant update on table "public"."mf_usuarios" to "authenticated";

grant delete on table "public"."mf_usuarios" to "service_role";

grant insert on table "public"."mf_usuarios" to "service_role";

grant references on table "public"."mf_usuarios" to "service_role";

grant select on table "public"."mf_usuarios" to "service_role";

grant trigger on table "public"."mf_usuarios" to "service_role";

grant truncate on table "public"."mf_usuarios" to "service_role";

grant update on table "public"."mf_usuarios" to "service_role";


  create policy "delete_own"
  on "public"."lancamentos"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "insert_own"
  on "public"."lancamentos"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "select_own"
  on "public"."lancamentos"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "update_own"
  on "public"."lancamentos"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "backup_owner"
  on "public"."meufinanceiro_backup"
  as permissive
  for all
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "usuarios_all"
  on "public"."meufinanceiro_usuarios"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "user_owns_bancos"
  on "public"."mf_bancos"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_categorias"
  on "public"."mf_categorias"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_config"
  on "public"."mf_config"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_lancamentos"
  on "public"."mf_lancamentos"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_pagamentos"
  on "public"."mf_pagamentos"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_provisoes"
  on "public"."mf_provisoes"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_terceiros"
  on "public"."mf_terceiros"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "user_owns_tombstones"
  on "public"."mf_tombstones"
  as permissive
  for all
  to public
using ((auth.uid() = user_id));



  create policy "own_or_admin"
  on "public"."mf_usuarios"
  as permissive
  for all
  to public
using (((auth.uid() = id) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text) OR (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)));


CREATE TRIGGER trg_config_updated BEFORE UPDATE ON public.mf_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON public.mf_lancamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


