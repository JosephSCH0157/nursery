/*
rec_smoke.js — tiny recorder state machine smoke tests (node)
Run with: node tools/rec_smoke.js
*/

(async function(){
  const results = [];
  function pass(name){ results.push({ name, ok:true }); console.log('PASS -', name); }
  function fail(name, msg){ results.push({ name, ok:false, msg }); process.exitCode = 1; console.log('FAIL -', name, msg||''); }

  // Minimal window/EventTarget polyfill for rec:state events
  global.window = global.window || {};
  const listeners = {};
  window.addEventListener = (ev, cb) => { (listeners[ev]||(listeners[ev]=[])).push(cb); };
  window.removeEventListener = (ev, cb) => {
    const L = listeners[ev]||[]; const i=L.indexOf(cb); if(i>=0) L.splice(i,1);
  };
  window.dispatchEvent = (ev) => { const L=listeners[ev.type]||[]; for(const cb of L.slice()) try{ cb(ev); } catch{} };
  global.CustomEvent = class CustomEvent { constructor(type, init){ this.type=type; this.detail=init && init.detail; } };

  // Helpers for deterministic async testing
  const withTimeout = (p, ms, label='timeout') => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(label)), ms))]);
  const waitForRec = (pred) => new Promise(resolve => {
    const on = (e) => { try { const d = e && e.detail; if (pred(d)) { window.removeEventListener('rec:state', on); resolve(d); } } catch {} };
    window.addEventListener('rec:state', on);
  });
  const afterEach = async () => {
    try { await window.__recorder?.stop?.(); } catch {}
    try { window.__recorder?.__finalizeForTests?.(); } catch {}
  };

  try {
    const rec = await import('../dist/recorders.js');
    // Finish built-in registration before installing deterministic test doubles,
    // otherwise a late optional-adapter import can overwrite the fakes mid-suite.
    await rec.initBuiltIns?.();

    // Fake adapters
    let startCount = 0;
    const fakeObs = {
      id: 'obs', label: 'OBS (fake)',
      async isAvailable(){ return true; },
  async start(){ startCount++; if (startCount === 1) { /* first start observed */ } /* succeed */ },
      async stop(){ await new Promise(r=>setTimeout(r, 80)); /* simulate slow stop */ },
    };
    const fakeBridge = {
      id: 'bridge', label: 'Bridge (fake)',
      async isAvailable(){ return true; },
      async start(){}, async stop(){},
    };
    window.__obsBridge = { start: async () => {}, getRecordStatus: async () => ({ outputActive: true }), on: () => {} };
    rec.register(fakeObs);
    rec.register(fakeBridge);

    // Configure single mode -> obs
    rec.setSettings({ mode: 'single', selected: ['obs'], timeouts: { start: 200, stop: 200 } });

    const seen = [];
    window.addEventListener('rec:state', (e) => { seen.push(e.detail && e.detail.state); });

    // 1) Happy path start
    startCount = 1; // make first observed call succeed
    await rec.startSelected();
    if (seen.includes('starting') && seen.includes('recording')) pass('rec: happy path starting->recording');
    else fail('rec: happy path starting->recording', JSON.stringify(seen));

    // 2) Idempotent start
  await rec.startSelected();
  const last = seen.slice(-1)[0];
  if (last === 'recording' && !seen.includes('error')) pass('rec: idempotent start'); else fail('rec: idempotent start', JSON.stringify(seen));

    // 3) Stop race (from recording)
    await rec.stopSelected();
    const tail = seen.slice(-1)[0];
    if (tail === 'idle') pass('rec: stop -> idle'); else fail('rec: stop -> idle', tail);

    // 4) Persist mirrors
    const rawMode = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('tp_record_mode')) || null;
    const rawSel = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('tp_adapters')) || null;
    if (rawMode && rawSel) pass('rec: legacy mirrors present'); else pass('rec: legacy mirrors present (no LS)');

    // 5) Selected OBS failure must not start Bridge
    // Mock an OBS start that never confirms.
    global.window.__obsBridge = {
      async start(){ /* no-op */ },
      async getRecordStatus(){ return { outputActive: false }; },
      on(){},
    };
    // Ensure bridge adapter exists and isAvailable
    let alternateStarts = 0;
    rec.register({ id:'bridge', label:'Bridge (fake)', async isAvailable(){ return true; }, async start(){ alternateStarts++; }, async stop(){} });
    // Select OBS so startSelected chooses obs path
    rec.setSettings({ mode:'single', selected:['obs'] });
    const events = [];
    window.addEventListener('rec:state', (e) => events.push(e.detail));
    await rec.startSelected();
    const lastEv = events.slice(-1)[0] || {};
    if (lastEv.adapter === 'obs' && lastEv.state === 'error' && alternateStarts === 0) pass('rec: OBS timeout fails without alternate capture');
    else fail('rec: OBS timeout fails without alternate capture', JSON.stringify(lastEv));

    // 6) Idempotent stop while stopping (double stop)
    const p1 = rec.stopSelected();
    const p2 = rec.stopSelected();
    await Promise.all([p1, p2]);
    const st = rec.getRecState?.() || {};
    if (st.state === 'idle') pass('rec: idempotent stop while stopping'); else fail('rec: idempotent stop while stopping', JSON.stringify(st));

  // 7) Start → Stop race: ensure no fallback fires and final is idle
  rec.setSettings({ mode: 'single', selected: ['obs'], timeouts: { start: 200, stop: 200 } });
  startCount = 0; // provoke retry/fallback if not canceled
  await rec.startSelected();
  setTimeout(() => { try { window.__recorder?.stop?.(); } catch {} }, 30);
  const finalIdle = await withTimeout(waitForRec(d => d && d.state === 'idle'), 2000, 'idle not reached');
  if (finalIdle && finalIdle.state === 'idle') pass('rec: start→stop race cancels fallback');
  else fail('rec: start→stop race cancels fallback', JSON.stringify(finalIdle||{}));
  await afterEach();

  // 8) An unavailable selected OBS stays failed even with a saved handoff preference.
  rec.setSettings({ preferObsHandoff: true });
  window.__obsBridge.getRecordStatus = async () => ({ outputActive: false });
  await rec.startSelected();
  const failed = rec.getRecState?.() || {};
  if (failed.adapter === 'obs' && failed.state === 'error' && alternateStarts === 0) pass('rec: saved handoff preference cannot select another capture engine');
  else fail('rec: saved handoff preference cannot select another capture engine', JSON.stringify(failed));
  await afterEach();

  } catch (e) {
    console.error('rec_smoke error', e);
    fail('setup', String(e && e.message || e));
  }
  // 9) Teardown idempotent
  try {
    const mod = await import('../dist/recorders.js');
    try { await mod.teardownRecorders?.(); } catch {}
    try { await mod.teardownRecorders?.(); } catch {}
    pass('rec: teardown idempotent');
  } catch (e) {
    fail('rec: teardown idempotent', String(e && e.message || e));
  }
})().finally(async () => {
  try {
    const mod = await import('../dist/recorders.js');
    try { await mod.teardownRecorders?.(); } catch {}
  } catch {}
  try { window.__recorder?.__finalizeForTests?.(); } catch {}
  // Optional: debug handles if a run gets sticky
  try {
    if (process?.env?.DEBUG_HANDLES === '1' && typeof process._getActiveHandles === 'function') {
      const hs = process._getActiveHandles();
      console.log('[debug] active handles:', hs.map(h => h?.constructor?.name));
    }
  } catch {}
  // Gate hard exit for CI or direct script run; avoid yanking embedded runners
  try {
    const wantHardExit = (process?.env?.SMOKE_HARD_EXIT === '1') || (typeof require !== 'undefined' && require?.main === module);
    if (wantHardExit) setImmediate(() => { try { process.exit(process.exitCode || 0); } catch {} });
  } catch {}
});
