import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readDisposableBrowserConfig } from './browser-disposable-isolation.mts';

export function assertStorageFixtureTarget(url: string, env: NodeJS.ProcessEnv = process.env) {
  assert.equal(env.GITHUB_ACTIONS,'true');
  assert.equal(env.GITHUB_REPOSITORY,'JosephSCH0157/nursery');
  assert.match(env.GITHUB_RUN_ID??'',/^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT??'',/^\d+$/);
  assert(env.RUNNER_TEMP);
  const expected=path.join(env.RUNNER_TEMP,`forge-he3-browser-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`);
  assert.equal(path.resolve(env.FORGE_BROWSER_SUPABASE_WORKDIR??''),path.resolve(expected));
  const target=readDisposableBrowserConfig(env);
  assert(target && target.apiOrigin===url,'Storage fixture requires the exact disposable loopback API');
}

// Only the job-owned, whole-database-disposable browser lane may create these
// synthetic receipt fixtures. They are never Stripe evidence or cash funding.
export async function provisionBrowserStorageEntitlement(admin: SupabaseClient,url: string,userId: string) {
  assertStorageFixtureTarget(url);
  const tongs=admin.schema('tongs');
  const mode=await tongs.from('financial_runtime_environment_revisions').select('financial_environment').order('revision',{ascending:false}).limit(1).single();
  assert(!mode.error && mode.data?.financial_environment==='test','Fixture cannot activate or change financial mode');
  const suffix=`browser_storage_${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT}_${userId}`;
  const start=new Date();start.setUTCHours(0,0,0,0);
  const end=new Date(start.getTime()+2*86400000);
  const uuid=createHash('sha256').update(suffix).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
  const customer=`cus_${suffix}`,subscription=`sub_${suffix}`;
  const upsert=await tongs.rpc('upsert_billing_subscription',{p_user_id:userId,p_stripe_customer_id:customer,
    p_stripe_subscription_id:subscription,p_purchase_type:'subscription',p_item_id:'creator',p_interval:'monthly',p_status:'active',
    p_current_period_start:start.toISOString(),p_current_period_end:end.toISOString(),p_metadata:{source:'disposable-browser-storage-fixture'}});
  if(upsert.error)throw new Error('Disposable storage subscription prerequisite failed: '+upsert.error.message);
  const receipt=await tongs.rpc('record_subscription_cycle_receipt',{p_receipt_id:uuid,p_user_id:userId,p_stripe_event_id:`evt_${suffix}`,
    p_stripe_invoice_id:`in_${suffix}`,p_stripe_subscription_id:subscription,p_stripe_payment_intent_id:null,p_livemode:false,
    p_purchase_type:'subscription',p_plan_item_id:'creator',p_gross_amount_micros:1000000,p_currency:'USD',
    p_period_start:start.toISOString(),p_period_end:end.toISOString(),p_received_at:start.toISOString(),
    p_metadata_json:{source:'synthetic-disposable-browser-fixture',not_provider_evidence:true}});
  if(receipt.error)throw new Error('Disposable storage receipt prerequisite failed: '+receipt.error.message);
}
