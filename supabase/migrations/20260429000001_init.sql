-- BiasLens initial schema.
-- Single `analyses` table backs both the exact-match cache (input_hash + model)
-- and the semantic cache (cosine ANN over embedding). RLS is enabled with no
-- policies — server-side code uses the service-role key (which bypasses RLS),
-- and the anon key gets nothing.

create extension if not exists vector;

create table if not exists public.analyses (
    id          uuid        primary key default gen_random_uuid(),
    input_hash  text        not null,
    input_text  text        not null,
    result      jsonb       not null,
    embedding   vector(1536) not null,
    bias_score  numeric     not null,
    leaning     text        not null,
    model       text        not null,
    created_at  timestamptz not null default now()
);

-- Composite unique index supports the exact-cache lookup `where input_hash = ?
-- and model = ?` and prevents duplicate inserts on simultaneous misses. Same
-- text under a different model can co-exist (model upgrades create a new row).
create unique index if not exists analyses_input_hash_model_idx
    on public.analyses (input_hash, model);

-- Powers the recent-analyses list view (Phase 5) without needing a sort.
create index if not exists analyses_created_at_desc_idx
    on public.analyses (created_at desc);

-- HNSW for cosine ANN. Maintenance-free and effective from row 1, unlike
-- ivfflat which needs a training population before it indexes well.
create index if not exists analyses_embedding_idx
    on public.analyses using hnsw (embedding vector_cosine_ops);

alter table public.analyses enable row level security;

-- Cosine-similarity ANN lookup for the semantic cache. Returns the single
-- best match above the supplied similarity threshold within the freshness
-- window for the given model. The `<=>` operator is pgvector's cosine
-- distance; similarity = 1 - distance.
create or replace function public.match_analysis(
    query_embedding  vector(1536),
    match_model      text,
    match_threshold  float,
    match_cutoff     timestamptz
)
returns table (
    id          uuid,
    input_text  text,
    result      jsonb,
    bias_score  numeric,
    leaning     text,
    model       text,
    created_at  timestamptz,
    similarity  float
)
language sql
stable
as $$
    select
        a.id,
        a.input_text,
        a.result,
        a.bias_score,
        a.leaning,
        a.model,
        a.created_at,
        1 - (a.embedding <=> query_embedding) as similarity
    from public.analyses a
    where a.model = match_model
      and a.created_at >= match_cutoff
      and 1 - (a.embedding <=> query_embedding) >= match_threshold
    order by a.embedding <=> query_embedding
    limit 1;
$$;
