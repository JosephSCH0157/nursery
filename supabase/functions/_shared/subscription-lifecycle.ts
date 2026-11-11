import { findStripeCatalogPriceById } from './stripe-catalog.ts';
import { buildForgeCheckoutMetadata, parseForgePurchaseMetadata } from './forge-billing-metadata.ts';
import { resolveInvoiceSubscriptionId } from './stripe-invoice-compat.ts';
const object=(v: unknown):Record<string,unknown>=>v && typeof v==='object'?v as Record<string,unknown>:{};
const id=(v:unknown):string|null=>typeof v==='string'?v:typeof object(v).id==='string'?object(v).id as string:null;
const integer=(v:unknown):v is number=>Number.isSafeInteger(v);
const iso=(v:number)=>new Date(v*1000).toISOString();

export function recurringPriceAuthority(input:unknown,userId:string) {
 const sub=object(input),items=object(sub.items),data=items.data;
 if(items.has_more || !Array.isArray(data) || data.length!==1 || object(data[0]).quantity!==1)throw Error('Unsupported recurring subscription shape');
 const price=object(object(data[0]).price),match=findStripeCatalogPriceById(String(price.id));
 if(!match || (match.kind!=='storage' && match.kind!=='plan'))throw Error('Unsupported recurring price authority');
 const ids=sub.livemode?[match.livePriceId,...(match.legacyLivePriceIds??[])]:[match.testPriceId,...(match.legacyTestPriceIds??[])];
 if(typeof sub.livemode!=='boolean' || !ids.includes(String(price.id)))throw Error('Recurring price mode mismatch');
 const recurring=object(price.recurring),months=match.interval==='quarterly'?3:1;
 if(price.type!=='recurring' || recurring.interval!=='month' || recurring.interval_count!==months)throw Error('Recurring interval mismatch');
 return parseForgePurchaseMetadata({metadata:buildForgeCheckoutMetadata({userId,catalogPrice:match}),mode:'subscription'});
}

/** Only freshly retrieved invoice/subscription snapshots enter this validator.
 * Cash collection is deliberately not required, nor is an invoice amount alone
 * sufficient. Trial, manual, mixed, truncated, credit-only, and unrelated periods
 * never manufacture paid storage capacity. */
export function paidSubscriptionServicePeriod(invoiceInput:unknown,subscriptionInput:unknown,itemId:string) {
 const invoice=object(invoiceInput),sub=object(subscriptionInput);
 if(sub.status!=='active' || invoice.status!=='paid' || invoice.paid===false
   || invoice.paid_out_of_band===true || invoice.amount_remaining!==0
   || !integer(invoice.amount_paid) || invoice.amount_paid<0
   || !['subscription_create','subscription_cycle','subscription_update'].includes(String(invoice.billing_reason)))return null;
 if(id(invoice.customer)!==id(sub.customer) || invoice.livemode!==sub.livemode
   || resolveInvoiceSubscriptionId(invoice)!==sub.id)throw Error('Paid invoice identity mismatch');
 const lines=object(invoice.lines),data=lines.data;
 if(lines.has_more || !Array.isArray(data))throw Error('Complete invoice lines required');
 const subItems=object(sub.items).data;
 if(!Array.isArray(subItems)||subItems.length!==1)throw Error('Single recurring item required');
 const item=object(subItems[0]),price=object(item.price),match=findStripeCatalogPriceById(String(price.id));
 if(!match || (match.kind!=='plan' && match.kind!=='storage'))throw Error('Unknown service period price');
 if(!integer(price.unit_amount)||price.unit_amount<=0)return null;
 const start=sub.current_period_start??item.current_period_start,end=sub.current_period_end??item.current_period_end;
 if(!integer(start)||!integer(end)||end<=start)throw Error('Authoritative subscription period required');
 const candidates=data.map(object).filter(line=>{
   const details=object(object(line.parent).subscription_item_details);
   const lineSub=id(line.subscription)??id(details.subscription);
   const linePrice=id(line.price)??id(object(object(line.pricing).price_details).price);
   const prorated=line.proration===true || details.proration===true;
   return lineSub===sub.id && linePrice===price.id && line.quantity===1
    && integer(line.amount) && line.amount>=0 && (!prorated || (invoice.billing_reason==='subscription_update' && line.amount>0));
 });
 if(candidates.length!==1)return null;
 const period=object(candidates[0].period),from=period.start,to=period.end;
 if(!integer(from)||!integer(to)||from<start||to>end||to<=from)return null;
 if(integer(sub.trial_end)&&from<sub.trial_end)return null;
 if(typeof invoice.id!=='string'||!invoice.id)return null;
 return {invoice_id:invoice.id,subscription_id:String(sub.id),customer_id:id(sub.customer),stripe_mode:sub.livemode?'live':'test',
   status:'paid',billing_reason:invoice.billing_reason,item_id:itemId,price_id:price.id,price_amount:price.unit_amount,quantity:1,
   amount_paid:invoice.amount_paid,amount_remaining:0,period_start:iso(from),period_end:iso(to),trial_overlap:false};
}

/** A token is acquired BEFORE every provider read. A superseded operation must
 * re-fetch; replaying its previous snapshot under a fresh token is forbidden. */
export async function fencedSubscriptionRefresh<T>(deps:{
 begin:()=>Promise<{token:string}>;
 retrieve:()=>Promise<T>;
 commit:(token:string,current:T)=>Promise<{outcome:string}>;
}) {
 for(let attempt=0;attempt<3;attempt++) {
   const fence=await deps.begin();
   if(!fence.token)throw Error('Missing subscription fence');
   const current=await deps.retrieve();
   const result=await deps.commit(fence.token,current);
   if(result.outcome==='committed')return current;
   if(result.outcome!=='superseded')throw Error('Invalid subscription refresh acknowledgment');
 }
 throw Error('Subscription refresh superseded; retry authoritative refresh');
}
