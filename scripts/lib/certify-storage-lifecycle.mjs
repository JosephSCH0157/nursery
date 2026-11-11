import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
export async function certifyStorageLifecycle({sql,sqlArgs,service,subscription,receipt,capacity}) {
 const parse=s=>JSON.parse(s.trim().split('\n').at(-1));
 const user='11000000-0000-4000-8000-000000000003';
 const start=new Date(Date.now()-86400000).toISOString(),end=new Date(Date.now()+86400000).toISOString();
 const snap=(id,status='active',kind='subscription',item='creator')=>({id,user_id:user,customer_id:'cus_storage_fixture',purchase_type:kind,
   item_id:item,interval:'monthly',status,price_id:'price_synthetic_'+item,period_start:start,period_end:end,cancel_at_period_end:false,canceled_at:null,metadata:{synthetic:true}});
 const period=(s,invoice='in_zero')=>({invoice_id:invoice,subscription_id:s.id,customer_id:s.customer_id,stripe_mode:'test',status:'paid',
   billing_reason:'subscription_cycle',item_id:s.item_id,price_id:s.price_id,price_amount:500,quantity:1,amount_paid:0,amount_remaining:0,
   period_start:s.period_start,period_end:s.period_end,trial_overlap:false});
 const json=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 const begin=id=>parse(sql(service(`select tongs.begin_subscription_refresh('${id}',false,'evt_fixture');`))).token;
 const commitSql=(s,token,p=null)=>`select tongs.commit_subscription_refresh('${s.id}',false,'${token}',${json(s)},${p?json(p):'null'});`;
 const commit=(s,t,p=null)=>parse(sql(service(commitSql(s,t,p))));
 const refresh=(s,p=null)=>commit(s,begin(s.id),p);
 const journalBefore=sql('select count(*) from tongs.accounting_journal_events;');
 // Zero cash remains invalid as cash; valid service evidence is independent.
 assert.throws(()=>sql(receipt('sub_zero','creator','subscription').replace(',1000000,',',0,')),/invalid subscription cycle receipt/);
 const zero=snap('sub_zero'),zToken=begin(zero.id),zPeriod=period(zero);
 assert.equal(commit(zero,zToken,zPeriod).outcome,'committed');
 assert.equal(capacity().base_bytes,5*1024**3,'zero-total settled service period grants subscribed capacity');
 assert.equal(commit(zero,zToken,zPeriod).replay,true);
 assert.equal(sql('select count(*) from tongs.subscription_service_periods;').trim(),'1');
 assert.throws(()=>commit({...zero,item_id:'pro'},zToken,zPeriod),/replay conflict/);
 for(const patch of [{status:'open'},{amount_remaining:1},{quantity:2},{price_amount:0},{trial_overlap:true},
  {stripe_mode:'live'},{customer_id:'cus_other'},{subscription_id:'sub_other'}, {period_end:start}]) {
  const t=begin(zero.id);assert.throws(()=>commit(zero,t,{...zPeriod,...patch}),/invalid paid subscription service period/);
 }
 assert.equal(refresh({...zero,status:'past_due'}).outcome,'committed');
 assert.equal(capacity().base_bytes,5*1024**3,'failed-payment transition preserves already paid-through service');
 const expired={...zero,period_start:new Date(Date.now()-172800000).toISOString(),period_end:new Date(Date.now()-86400000).toISOString()};
 refresh(expired,period(expired,'in_expired'));assert.equal(capacity().base_bytes,0,'expired subscription period grants nothing');
 refresh(zero,period(zero,'in_renewed'));assert.equal(capacity().base_bytes,5*1024**3,'settled renewal reestablishes capacity');
 refresh({...zero,status:'canceled'});assert.equal(capacity().base_bytes,0);
 assert.throws(()=>refresh(zero),/cancellation is terminal/);
 assert.throws(()=>sql(subscription(zero.id,'creator','subscription')),/fenced subscription requires/);
 // Two real connections: canceled transaction holds the fence, stale writer
 // waits and then observes supersession after commit. No event timestamps.
 const active=snap('sub_race','active','cloud_storage','50gb_v2');
 refresh(active,period(active,'in_storage'));
 const staleToken=begin(active.id),cancelToken=begin(active.id);
 const execute=q=>new Promise(resolve=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let out='',err='';
 p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(q);});
 const cancel=execute(service(`set application_name='storage-cert-cancel';begin;${commitSql({...active,status:'canceled'},cancelToken)}select pg_sleep(2);commit;`));
 let ready=false;for(let i=0;i<100;i++){
  if(sql("select exists(select 1 from pg_stat_activity where application_name='storage-cert-cancel' and wait_event='PgSleep');").trim()==='t'){ready=true;break;}
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(ready,true);
 const stale=execute(service(`begin;${commitSql(active,staleToken)}commit;`));
 const results=await Promise.all([cancel,stale]);assert.ok(results.every(r=>r.code===0),JSON.stringify(results));
 assert.match(results[1].out,/superseded/);
 assert.equal(sql("select status from tongs.billing_subscriptions where stripe_subscription_id='sub_race';").trim(),'canceled');
 assert.equal(capacity().addon_bytes,0);
 assert.throws(()=>sql(subscription(active.id,'50gb_v2','cloud_storage')),/fenced subscription requires/);
 // Simultaneous begin calls get distinct generations. Only the current token wins.
 const begins=await Promise.all([1,2].map(i=>execute(service(`select tongs.begin_subscription_refresh('sub_simultaneous',false,'evt_${i}');`))));
 assert.ok(begins.every(r=>r.code===0));
 const tokens=begins.map(r=>parse(r.out));assert.notEqual(tokens[0].token,tokens[1].token);
 const current=tokens.reduce((a,b)=>a.generation>b.generation?a:b),old=tokens.find(t=>t!==current);
 const simultaneous=snap('sub_simultaneous','active','cloud_storage','150gb');
 assert.equal(commit(simultaneous,old.token).outcome,'superseded');
 assert.equal(commit(simultaneous,current.token,period(simultaneous,'in_simultaneous')).outcome,'committed');
 assert.equal(capacity().addon_bytes,150*1024**3);
 const down={...simultaneous,item_id:'50gb_v2',price_id:'price_synthetic_50gb_v2'};
 refresh(down,period(down,'in_downgrade'));assert.equal(capacity().addon_bytes,50*1024**3);
 refresh({...down,status:'canceled'});assert.equal(capacity().addon_bytes,0);
 assert.throws(()=>sql(`set role authenticated;select tongs.begin_subscription_refresh('sub_denied',false,'evt_denied');`),/permission denied/);
 assert.throws(()=>sql(service(`update tongs.subscription_service_periods set item_id='pro';`)),/permission denied/);
 assert.throws(()=>sql(`delete from tongs.subscription_service_periods;`),/immutable/);
 assert.equal(sql('select count(*) from tongs.accounting_journal_events;'),journalBefore,'service evidence must not invent cash or credits');
 return {result:'PASS',zeroTotalEntitlement:true,immutableReplay:true,invalidPeriodDenials:9,canceledStatus:'canceled',staleWriter:'superseded',
  concurrentBegin:true,renewal:true,downgrade:true,paidThroughGrace:true,financialJournalUnchanged:true,
  scope:'Authenticated synthetic service-role PostgreSQL fixtures across independent connections; no hosted Stripe event delivery.'};
}
