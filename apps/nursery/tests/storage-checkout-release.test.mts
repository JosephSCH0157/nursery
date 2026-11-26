import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as catalog from '../../../supabase/functions/_shared/stripe-catalog.ts';
import * as metadata from '../../../supabase/functions/_shared/forge-billing-metadata.ts';
import * as financial from '../../../supabase/functions/_shared/financial-environment.ts';
import {storageReleasePauseResponse} from '../../../supabase/functions/_shared/storage-release-pause.ts';

// Execute the actual Deno entrypoint with inert adapters; never genuine payment
// or hosted evidence. All financial authority helpers remain the real imports.
const source=readFileSync(new URL('../../../supabase/functions/create-checkout-session/index.ts',import.meta.url),'utf8');
const executable=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,'');
const user='11111111-1111-4111-8111-111111111111';
function fixture(options:{live?:boolean;level?:'50gb_v2'|'150gb'|'500gb';existing?:boolean;pause?:string;invalidAuth?:boolean}={}){
  const entry=catalog.STRIPE_CATALOG.storage[options.level??'50gb_v2'];
  const price:any={id:options.live?entry.livePriceId:entry.testPriceId,
    product:options.live?entry.liveProductId:entry.testProductId,livemode:options.live??false,
    active:true,type:'recurring',metadata:{},recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const reads:string[]=[],writes:string[]=[],sessions:any[]=[];
  let pause=options.pause,handler!:(req:Request)=>Promise<Response>;
  let beforePrice:(()=>Promise<void>)|undefined;
  const stripe={
    prices:{retrieve:async()=>{reads.push('price');await beforePrice?.();return price;}},
    customers:{create:async()=>{writes.push('customer-create');return{id:'cus_synthetic'};},update:async()=>{writes.push('customer-update');return{};}},
    checkout:{sessions:{create:async(args:any)=>{writes.push('checkout');sessions.push(args);return{id:'cs_synthetic',url:'https://checkout.stripe.test/synthetic'};}}},
  };
  const rpc=async(name:string)=>{
    if(name==='read_financial_runtime_environment'){reads.push(name);return{data:{financial_environment:options.live?'live':'test'},error:null};}
    if(name==='read_stripe_customer_environment_identifier'){reads.push(name);return{data:options.existing?{stripe_customer_id:'cus_existing'}:null,error:null};}
    assert.ok(['record_stripe_customer_environment_identifier','upsert_billing_customer'].includes(name),name);
    writes.push(name);return{data:null,error:null};
  };
  runInNewContext(executable,{
    ...catalog,...metadata,...financial,storageReleasePauseResponse,Response,
    console:{log(){},warn(){},error(){}},
    Deno:{env:{get:(name:string)=>name==='FORGE_STORAGE_RELEASE_MODE'?pause:({
      STRIPE_SECRET_KEY:'sk_test_synthetic_no_network',SUPABASE_URL:'http://localhost:54321',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
      STRIPE_SUCCESS_URL:'http://localhost/success',STRIPE_CANCEL_URL:'http://localhost/cancel',DENO_DEPLOYMENT_ID:'synthetic',
    } as Record<string,string>)[name]}},
    Stripe:class{constructor(){return stripe;}},
    createClient:()=>({auth:{getUser:async()=>({data:{user:options.invalidAuth?null:{id:user,user_metadata:{}}},error:null})},
      schema:()=>({rpc}),from:()=>({update:()=>{writes.push('profile');return{eq:async()=>({error:null})};}})}),
    serve:(callback:typeof handler)=>{handler=callback;},
  });
  const send=(id=price.id,method='POST')=>handler(new Request('http://localhost/checkout',{method,
    headers:{authorization:'Bearer synthetic',...(method==='POST'?{'content-type':'application/json'}:{})},
    ...(method==='POST'?{body:JSON.stringify({priceId:id})}:{})}));
  return{price,reads,writes,sessions,send,setPause:(value:string)=>{pause=value;},beforePrice:(fn:()=>Promise<void>)=>{beforePrice=fn;}};
}

for(const live of [false,true])for(const level of ['50gb_v2','150gb','500gb'] as const){
  test(`actual Checkout uses canonical ${level} recurring offer and metadata (live=${live})`,async()=>{
    const f=fixture({live,level,existing:true});const response=await f.send();
    assert.equal(response.status,200,await response.text());assert.equal(f.sessions.length,1);
    const session=f.sessions[0];assert.equal(session.mode,'subscription');
    assert.equal(session.customer,'cus_existing');assert.equal(session.line_items[0].price,f.price.id);
    assert.equal(session.line_items[0].quantity,1);assert.equal(session.metadata.forge_item_id,level);
    assert.equal(session.metadata.forge_purchase_type,'cloud_storage');
    assert.deepEqual(session.metadata,session.subscription_data.metadata);
    assert.ok(!f.writes.some(x=>/receipt|subscription_refresh|capacity/.test(x)),'Checkout cannot grant entitlement');
  });
}

test('invalid Storage offers fail before any Stripe or database mutation',async()=>{
  for(const change of [
    (f:ReturnType<typeof fixture>)=>{f.price.livemode=true;},
    (f:ReturnType<typeof fixture>)=>{f.price.product='prod_wrong';},
    (f:ReturnType<typeof fixture>)=>{f.price.active=false;},
    (f:ReturnType<typeof fixture>)=>{f.price.type='one_time';f.price.recurring=null;},
    (f:ReturnType<typeof fixture>)=>{f.price.recurring.interval='year';},
    (f:ReturnType<typeof fixture>)=>{f.price.recurring.interval_count=3;},
    (f:ReturnType<typeof fixture>)=>{f.price.recurring.usage_type='metered';},
  ]){const f=fixture();change(f);assert.ok((await f.send()).status>=400);assert.deepEqual(f.writes,[]);}
  const unknown=fixture();assert.equal((await unknown.send('price_unknown')).status,400);assert.deepEqual(unknown.writes,[]);
  const denied=fixture({invalidAuth:true});assert.equal((await denied.send()).status,401);assert.deepEqual(denied.writes,[]);
});

test('paused Checkout permits CORS but creates no customer, session, or receipt',async()=>{
  for(const pause of ['paused','typo','']){const f=fixture({pause});
    assert.equal((await f.send(undefined,'OPTIONS')).status,200);
    const response=await f.send();assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('retry-after'),'60');
    assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);
    f.setPause('open');assert.equal((await f.send()).status,200);assert.equal(f.sessions.length,1);
  }
});

test('pause does not pretend to cancel admitted work: drain it before schema cutover',async()=>{
  const f=fixture();let release!:()=>void;let entered!:()=>void;
  const entering=new Promise<void>(resolve=>{entered=resolve;});
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  f.beforePrice(async()=>{entered();await blocked;});
  const inFlight=f.send();await entering;f.setPause('paused');
  assert.equal((await f.send()).status,503);assert.equal(f.sessions.length,0);
  release();assert.equal((await inFlight).status,200);assert.equal(f.sessions.length,1);
  assert.equal((await f.send()).status,503,'no automatic resume after in-flight completion');
});
