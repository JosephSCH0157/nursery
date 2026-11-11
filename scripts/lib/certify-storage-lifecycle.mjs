import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
export async function certifyStorageLifecycle({sql,sqlArgs,service,subscription,receipt,capacity}) {
 const gaps=[];
 // A fully discounted paid Stripe invoice is not a cash receipt. The unchanged
 // journal must reject fabricated zero cash; test the resulting capacity gap.
 sql(subscription('sub_zero','creator','subscription'));
 const zero=receipt('sub_zero','creator','subscription').replace(',1000000,',',0,');
 assert.throws(()=>sql(zero),/invalid subscription cycle receipt/);
 if(capacity().base_bytes!==5*1024**3)gaps.push('zero-total paid membership has no entitlement evidence');
 sql(subscription('sub_zero','creator','subscription','canceled'));
 sql(subscription('sub_race','50gb_v2','cloud_storage'));
 sql(receipt('sub_race','50gb_v2','cloud_storage'));
 const execute=q=>new Promise(resolve=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let err='';p.stderr.on('data',x=>err+=x);p.stdout.resume();p.on('close',code=>resolve({code,err}));p.stdin.end(q);});
 const cancel=execute(service(`set application_name='storage-cert-cancel';begin;${subscription('sub_race','50gb_v2','cloud_storage','canceled')}select pg_sleep(2);commit;`));
 // Observe an actual transaction holding the row lock, not arbitrary timing.
 let ready=false;for(let i=0;i<100;i++){
  if(sql("select exists(select 1 from pg_stat_activity where application_name='storage-cert-cancel' and wait_event='PgSleep');").trim()==='t'){ready=true;break;}
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(ready,true,'cancellation reached the transaction barrier');
 // Snapshot was fetched before cancellation but reaches the database second.
 const stale=execute(service(`begin;${subscription('sub_race','50gb_v2','cloud_storage')}commit;`));
 const results=await Promise.all([cancel,stale]);assert.ok(results.every(r=>r.code===0),JSON.stringify(results));
 const finalStatus=sql("select status from tongs.billing_subscriptions where stripe_subscription_id='sub_race';").trim();
 if(finalStatus!=='canceled')gaps.push('stale concurrent snapshot resurrects canceled storage subscription');
 sql(subscription('sub_race','50gb_v2','cloud_storage','canceled'));
 return {result:gaps.length?'FAIL':'PASS',gaps,zeroCashReceiptRejected:true,concurrentFinalStatus:finalStatus,
 scope:'Real disposable PostgreSQL RPC calls in separate processes; no Stripe event delivery or fabricated provider evidence.'};
}
