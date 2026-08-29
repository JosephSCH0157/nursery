begin;

alter table if exists tongs.assets
  add column if not exists variant_kind text not null default 'original',
  add column if not exists source_asset_id uuid null references tongs.assets(id) on delete cascade,
  add column if not exists width integer null,
  add column if not exists height integer null,
  add column if not exists cache_control text null,
  add column if not exists variant_version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assets_variant_kind_check'
      and conrelid = 'tongs.assets'::regclass
  ) then
    alter table tongs.assets
      add constraint assets_variant_kind_check
      check (variant_kind in ('original', 'preview', 'thumb'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assets_variant_dims_check'
      and conrelid = 'tongs.assets'::regclass
  ) then
    alter table tongs.assets
      add constraint assets_variant_dims_check
      check (
        (width is null or width > 0)
        and (height is null or height > 0)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assets_variant_version_check'
      and conrelid = 'tongs.assets'::regclass
  ) then
    alter table tongs.assets
      add constraint assets_variant_version_check
      check (variant_version >= 1);
  end if;
end $$;

create unique index if not exists assets_source_variant_unique_idx
  on tongs.assets (source_asset_id, variant_kind, variant_version)
  where source_asset_id is not null;

create index if not exists assets_workpiece_variant_created_idx
  on tongs.assets (workpiece_id, variant_kind, status, created_at desc);

commit;
