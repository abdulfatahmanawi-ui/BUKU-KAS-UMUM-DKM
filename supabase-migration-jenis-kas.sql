alter table public.transactions add column if not exists fund text not null default 'DKM' check (fund in ('DKM','PEMBANGUNAN','PHBI'));
