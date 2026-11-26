import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { STRIPE_CATALOG } from '../../../supabase/functions/_shared/stripe-catalog.ts';
import { recurringPriceAuthority, paidSubscriptionServicePeriod, fencedSubscriptionRefresh, invoiceReceiptAuthority } from '../../../supabase/functions/_shared/subscription-lifecycle.ts';
import { FORGE_STRIPE_ACCOUNT, FORGE_STRIPE_SANDBOX } from '../../../supabase/functions/_shared/stripe-account-catalog.ts';
const user='11111111-1111-4111-8111-111111111111';
const secret='whsec_disposable_synthetic_fixture';
const stripe=new Stripe('sk_test_synthetic_no_network');
function fixture() {
 const price={id:String(STRIPE_CATALOG.storage['50gb_v2'].testPriceId),type:'recurring',unit_amount:500,recurring:{interval:'month',interval_count:1}};
 const subscription={id:'sub_synthetic',customer:'cus_synthetic',livemode:false,status:'active',current_period_start:1800000000,current_period_end:1802592000,trial_end:null as number|null,items:{has_more:false,data:[{quantity:1,price}]}};
 const invoice={id:'in_synthetic',subscription:subscription.id,customer:subscription.customer,livemode:false,status:'paid',paid:true,paid_out_of_band:false,amount_paid:0,amount_remaining:0,billing_reason:'subscription_cycle',lines:{has_more:false,data:[{subscription:subscription.id,price,quantity:1,amount:500,proration:false,period:{start:subscription.current_period_start,end:subscription.current_period_end}}]}};
 return {subscription,invoice};
}
function signedFixture() {
 const payload=JSON.stringify({id:'evt_synthetic',type:'invoice.paid',livemode:false,data:{object:fixture()}});
 const header=stripe.webhooks.generateTestHeaderString({payload,secret});
 const event=stripe.webhooks.constructEvent(payload,header,secret);
 return {payload,header,value:event.data.object as unknown as ReturnType<typeof fixture>};
}

for(const interval of ['monthly','quarterly'] as const)for(const environment of ['test','live'] as const){
 const entry=STRIPE_CATALOG.addons.seat[interval];
 const aliases=environment==='test' ? ('legacyTestPriceIds' in entry?entry.legacyTestPriceIds:[]) : ('legacyLivePriceIds' in entry?entry.legacyLivePriceIds:[]);
 const ids=[environment==='test'?entry.testPriceId:entry.livePriceId,...aliases];
 for(const priceId of ids)test(`configured seat ${interval} ${environment} ${priceId} projects lifecycle and paid period`,async()=>{
  const {subscription:s,invoice:i}=fixture();
  const context={accountId:FORGE_STRIPE_ACCOUNT,environment};
  s.livemode=i.livemode=environment==='live';
  s.items.data[0].price.id=priceId;
  s.items.data[0].price.recurring.interval_count=interval==='quarterly'?3:1;
  for(const status of ['active','trialing','past_due','canceled']){
   s.status=status;
   const projected=await fencedSubscriptionRefresh({begin:async()=>({token:'seat-fence'}),retrieve:async()=>({subscription:s,metadata:recurringPriceAuthority(s,user,context)}),commit:async(token,current)=>{
    assert.equal(token,'seat-fence');assert.equal(current.metadata.itemId,'seat');
    assert.equal(current.metadata.purchaseType,'subscription');assert.equal(current.metadata.offerId,entry.offerId);
    assert.equal(current.metadata.interval,interval);
    const period=paidSubscriptionServicePeriod(i,current.subscription,current.metadata.itemId,context);
    if(status==='active'){assert.equal(period?.item_id,'seat');assert.equal(period?.price_id,priceId);assert.equal(period?.stripe_mode,environment);}
    else assert.equal(period,null,'inactive status cannot manufacture paid service evidence');
    return {outcome:'committed'};
   }});
   assert.equal(projected.subscription.status,status);
  }
  i.amount_paid=500;
  const receipt=invoiceReceiptAuthority(i,s,user,context);
  assert.equal(receipt.metadata.itemId,'seat');assert.equal(receipt.metadata.offerId,entry.offerId);
 });
}
test('seat projection rejects unknown, pack, wrong account/mode, interval and subscription shape',()=>{
 const context={accountId:FORGE_STRIPE_ACCOUNT,environment:'test' as const};
 const seat=STRIPE_CATALOG.addons.seat.monthly;
 for(const change of [
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.id='price_unknown';},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.id=Object.values(STRIPE_CATALOG.packs.ai_credits)[0].testPriceId;},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.id=seat.livePriceId;},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.livemode=true;},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.type='one_time';},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.recurring.interval_count=3;},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].quantity=2;},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.data.push(s.items.data[0]);},
  (s:ReturnType<typeof fixture>['subscription'])=>{s.items.has_more=true;},
 ]){const {subscription:s}=fixture();s.items.data[0].price.id=seat.testPriceId;change(s);assert.throws(()=>recurringPriceAuthority(s,user,context));}
 const {subscription:s,invoice:i}=fixture();s.items.data[0].price.id=seat.testPriceId;
 for(const accountId of ['acct_unknown',FORGE_STRIPE_SANDBOX]){
  assert.throws(()=>recurringPriceAuthority(s,user,{...context,accountId}));
  assert.throws(()=>paidSubscriptionServicePeriod(i,s,'seat',{...context,accountId}));
 }
 for(const priceId of ['price_unknown',seat.livePriceId,Object.values(STRIPE_CATALOG.packs.ai_credits)[0].testPriceId]){
  s.items.data[0].price.id=priceId;assert.throws(()=>paidSubscriptionServicePeriod(i,s,'seat',context));
 }
});
test('seat paid evidence preserves invoice identity, payment and line restrictions',()=>{
 for(const condition of ['customer','mode','price','quantity','unpaid','manual','trial','truncated'] as const){
  const {subscription:s,invoice:i}=fixture();s.items.data[0].price.id=STRIPE_CATALOG.addons.seat.monthly.testPriceId;
  const context={accountId:FORGE_STRIPE_ACCOUNT,environment:'test' as const};
  recurringPriceAuthority(s,user,context);
  if(condition==='customer')i.customer='cus_other';
  if(condition==='mode')i.livemode=true;
  if(condition==='price')i.lines.data[0].price={...s.items.data[0].price,id:'price_unknown'};
  if(condition==='quantity')i.lines.data[0].quantity=2;
  if(condition==='unpaid')i.paid=false;
  if(condition==='manual')i.billing_reason='manual';
  if(condition==='trial')s.trial_end=s.current_period_end;
  if(condition==='truncated')i.lines.has_more=true;
  if(['customer','mode','truncated'].includes(condition))assert.throws(()=>paidSubscriptionServicePeriod(i,s,'seat',context));
  else assert.equal(paidSubscriptionServicePeriod(i,s,'seat',context),null);
 }
});
test('authenticated zero cash paid service period grants evidence without a cash receipt',()=>{
 const {value:{subscription,invoice},payload,header}=signedFixture();
 assert.throws(()=>stripe.webhooks.constructEvent(payload+' ',header,secret));
 assert.throws(()=>stripe.webhooks.constructEvent(payload,header,secret+'wrong'));
 const authority=recurringPriceAuthority(subscription,user);
 assert.equal(authority.itemId,'50gb_v2');
 assert.equal(paidSubscriptionServicePeriod(invoice,subscription,authority.itemId)?.amount_paid,0);
 for(const amount of [0,500]) {
  invoice.amount_paid=amount;
  assert.equal(paidSubscriptionServicePeriod(invoice,subscription,authority.itemId)?.period_end,new Date(subscription.current_period_end*1000).toISOString());
 }
});
for(const condition of ['trial','canceled','unpaid','open','manual','out_of_band','remaining','free_price','credit_line','wrong_period','quantity','truncated','customer','mode','subscription'] as const) {
 test(`does not authorize invalid zero invoice: ${condition}`,()=>{
  const {subscription:s,invoice:i}=signedFixture().value;
  switch(condition){
   case 'trial':s.trial_end=s.current_period_end;break;
   case 'canceled':s.status='canceled';break;
   case 'unpaid':i.paid=false;break;
   case 'open':i.status='open';break;
   case 'manual':i.billing_reason='manual';break;
   case 'out_of_band':i.paid_out_of_band=true;break;
   case 'remaining':i.amount_remaining=1;break;
   case 'free_price':s.items.data[0].price.unit_amount=0;break;
   case 'credit_line':i.lines.data[0].amount=-1;break;
   case 'wrong_period':i.lines.data[0].period.end++;break;
   case 'quantity':i.lines.data[0].quantity=2;break;
   case 'truncated':i.lines.has_more=true;break;
   case 'customer':i.customer='cus_other';break;
   case 'mode':i.livemode=true;break;
   case 'subscription':i.subscription='sub_other';break;
  }
  if(['truncated','customer','mode','subscription'].includes(condition))assert.throws(()=>paidSubscriptionServicePeriod(i,s,'50gb_v2'));
  else assert.equal(paidSubscriptionServicePeriod(i,s,'50gb_v2'),null);
 });
}
test('price authority rejects wrong mode, interval and mixed quantities',()=>{
 for(const mutate of [(s:ReturnType<typeof fixture>['subscription'])=>{s.livemode=true;},(s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].quantity=2;},(s:ReturnType<typeof fixture>['subscription'])=>{s.items.data[0].price.recurring.interval_count=3;}]) {
  const {subscription}=fixture();mutate(subscription);assert.throws(()=>recurringPriceAuthority(subscription,user));
 }
});
test('superseded refresh re-reads authoritative canceled state under a new fence',async()=>{
 const calls:string[]=[];let generation=0;
 const result=await fencedSubscriptionRefresh({begin:async()=>{calls.push('begin');return {token:String(++generation)};},retrieve:async()=>{calls.push('read');return generation===1?'active':'canceled';},commit:async(token,state)=>{calls.push(`${token}:${state}`);return {outcome:token==='1'?'superseded':'committed'};}});
 assert.equal(result,'canceled');assert.deepEqual(calls,['begin','read','1:active','begin','read','2:canceled']);
});
test('fence contention is bounded and fails for provider retry',async()=>{
 let reads=0;
 await assert.rejects(fencedSubscriptionRefresh({begin:async()=>({token:'token'}),retrieve:async()=>++reads,commit:async()=>({outcome:'superseded'})}),/superseded/);
 assert.equal(reads,3);
});
test('failed provider reads and invalid acknowledgments never pass',async()=>{
 let commits=0;
 await assert.rejects(fencedSubscriptionRefresh({begin:async()=>({token:'t'}),retrieve:async()=>{throw Error('provider unavailable');},commit:async()=>{commits++;return {outcome:'committed'};}}),/provider unavailable/);
 assert.equal(commits,0);
 await assert.rejects(fencedSubscriptionRefresh({begin:async()=>({token:'t'}),retrieve:async()=>1,commit:async()=>({outcome:'unknown'})}),/acknowledgment/);
});

test('delayed paid invoice retains invoiced offer after a downgrade or cancellation', async()=>{
 const {invoiceReceiptAuthority}=await import('../../../supabase/functions/_shared/subscription-lifecycle.ts');
 const {FORGE_STRIPE_ACCOUNT}=await import('../../../supabase/functions/_shared/stripe-account-catalog.ts');
 const {subscription:s,invoice:i}=fixture();
 i.amount_paid=2000;
 i.lines.data[0].price={...s.items.data[0].price,id:STRIPE_CATALOG.storage['500gb'].testPriceId,unit_amount:2000};
 i.lines.data[0].amount=2000;
 const context={accountId:FORGE_STRIPE_ACCOUNT,environment:'test' as const};
 for(const status of ['active','canceled']) {
  s.status=status;
  const receipt=invoiceReceiptAuthority(i,s,user,context);
  assert.equal(receipt.metadata.itemId,'500gb');
  assert.deepEqual(receipt.period,i.lines.data[0].period);
  assert.equal(s.items.data[0].price.id,STRIPE_CATALOG.storage['50gb_v2'].testPriceId);
 }
 for(const mutate of [(j:typeof i)=>{j.lines.has_more=true;},(j:typeof i)=>{j.customer='cus_other';},(j:typeof i)=>{j.lines.data.push(j.lines.data[0]);},(j:typeof i)=>{j.lines.data[0].price.id='price_unknown';},(j:typeof i)=>{j.lines.data[0].subscription='sub_other';},(j:typeof i)=>{j.status='open';},(j:typeof i)=>{j.lines.data[0].quantity=2;}]) {
  const bad=structuredClone(i);mutate(bad);assert.throws(()=>invoiceReceiptAuthority(bad,s,user,context));
 }
});
