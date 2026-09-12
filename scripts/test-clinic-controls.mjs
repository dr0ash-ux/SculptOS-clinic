// Disposable, in-memory PostgreSQL. Never connects to a live Supabase project.
// Legacy migrations are ordered by dependencies; auth/storage are minimal Supabase fixtures.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;grant usage on schema public,auth,storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
for(const name of ['0001_identity_tenancy_rbac.sql','20260817143000_master_treatment_pricing.sql','0002_finance_inventory_treatment_catalogue.sql','20260814170544_clinic_core_workflow.sql','20260814170618_clinic_personalization_policy.sql','20260816000000_add_patient_imaging_library.sql','20260816020000_add_clinic_practitioners.sql']){
 let sql=readFileSync('supabase/migrations/'+name,'utf8').replace('create extension if not exists pgcrypto;','');
 if(name.startsWith('0002')){await db.exec("alter type public.app_role add value if not exists 'manager'");sql=sql.replace("alter type public.app_role add value if not exists 'manager';",'')}
 try{await db.exec(sql)}catch(e){console.error('BASELINE',name,e.message);process.exit(1)}
}
await db.exec(`alter table patients add column next_follow_up_date date;grant select,insert,update,delete on all tables in schema public to authenticated;grant usage,select on all sequences in schema public to authenticated;`);
try{await db.exec(readFileSync('supabase/migrations/20260912094928_clinic_admin_controls.sql','utf8'));console.log('Migration applies successfully')}catch(e){console.error('MIGRATION',e.message,e.query?.slice(-1200));process.exit(1)}
try{await db.exec(readFileSync('supabase/tests/clinic_admin_controls.sql','utf8'));console.log('All permission, tenant, price, finance, imaging and leave assertions passed')}catch(e){console.error('ASSERTION',e.message,e.query?.slice(-1500));process.exit(1)}
await db.exec(readFileSync('supabase/migrations/20260912105036_branch_monthly_performance.sql','utf8'));
try { await db.exec(readFileSync('supabase/tests/branch_monthly_performance.sql','utf8')); console.log('Monthly report: full-month totals, branch isolation, categories, dates and permissions passed'); } catch(e) { console.error('REPORT ASSERTION',e.message);process.exit(1) }
await db.close();
