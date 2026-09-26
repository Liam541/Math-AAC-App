// Optional real-browser check. Run app.py on 8766 and an isolated headless Chrome
// with --remote-debugging-port=9224, then: node App/tests/layout-check.cjs
// This only uses the isolated browser test session; no package install required.
const fs = require('node:fs');
(async () => {
 const tabs = await (await fetch('http://127.0.0.1:9224/json/list')).json();
 const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let id=0; const pending=new Map(),errors=[];
 ws.addEventListener('message', e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id); m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+m.params.exceptionDetails.exception?.description);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception.description);return r.result.value;};
 await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true}); await send('Network.setBypassServiceWorker',{bypass:true});
 await send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:8766',storageTypes:'cache_storage,service_workers'});
 await send('Page.navigate',{url:'http://127.0.0.1:8766/index.html'});
 await new Promise(r=>setTimeout(r,800));
 const failures=[];let count=0;
 for(const [width,height] of [[1280,650],[1280,720],[1366,650],[1920,1080],[768,1024],[390,844]]) for(const size of [18,24]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await run(`document.documentElement.style.setProperty('--font','${size}px'); selectTab('math');selectSubtab(document.querySelector('[data-subtab="calculus"]')); document.getElementById('integral-expression').focus();`);
  const views=await run(`Array.from(document.querySelectorAll('[data-subtab]')).map(x=>({tab:x.dataset.subtab,pages:Array.from(document.getElementById(x.dataset.subtab).querySelectorAll('.tool-page')).map(p=>p.id)}))`);
  const inspect=async name=>{
   count++;
   const issues=await run(`(()=>{window.scrollTo(0,0);const bad=[];for(const el of document.querySelectorAll('button,input,select')){let r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const flowing=innerHeight<=850||innerWidth<=900;if(flowing){el.scrollIntoView({block:'center'});r=el.getBoundingClientRect();}if(r.bottom>innerHeight+.5||r.right>innerWidth+.5||r.top<0||r.left<0)bad.push((el.id||el.textContent.trim())+': outside '+Math.round(r.bottom));const panel=el.closest('.tool-panels');if(panel&&r.bottom>panel.getBoundingClientRect().bottom)bad.push((el.id||el.textContent.trim())+': outside panel');const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit&&!el.contains(hit))bad.push((el.id||el.textContent.trim())+': covered');if((r.height<(panel?64:44)||r.width<(panel?64:44)) && el.type!=='checkbox')bad.push((el.id||el.textContent.trim())+': small '+r.height);}return {bad,overflow:document.documentElement.scrollWidth>innerWidth+1||(innerHeight>850&&innerWidth>900&&document.documentElement.scrollHeight>innerHeight+1)};})()`);
   if(issues.bad.length||issues.overflow)failures.push({width,height,size,name,...issues});
  };
  for(const view of views){await run(`selectSubtab(document.querySelector('[data-subtab="${view.tab}"]'))`);for(const page of view.pages.length?view.pages:[null]){if(page)await run(`showToolPage('${page}')`);await inspect(page||view.tab);if(view.tab==='discrete'){for(const op of ['product','choose','permute','union','intersection','difference','and','or','implies']){await run(`selectDiscreteOperation('${op}');document.getElementById('discrete-calculate').click();`);await inspect('discrete-'+op);}await run(`selectDiscreteOperation('sum');`);}}}
  for(const tab of ['spell','appearance','settings']){await run(`selectTab('${tab}')`);await inspect(tab);}
 }
 const functional = await run(`(async () => {
  const get=id=>document.getElementById(id), assert=(ok,message)=>{if(!ok)throw Error(message);};
  selectTab('math'); sharedMath.choose(null); sharedMath.erase(true); get('display').focus();
  selectSubtab(document.querySelector('[data-subtab="calculus"]'));get('integral-expression').focus();document.querySelector('[data-action="clear"]').click();
  selectSubtab(document.querySelector('[data-subtab="greek"]'));
  [...get('greek-letters').children].find(b=>b.textContent.startsWith('\\u03b8')).click();
  sharedMath.edit('^2'); get('integral-variable').value='\\u03b8';get('integral-upper').value='3';
  get('shared-solve').click(); assert(get('display').value.endsWith('9'),'Greek integral did not solve: '+JSON.stringify({bar:get('display').value,expr:get('integral-expression').value,v:get('integral-variable').value,result:get('integral-result').textContent,target:sharedMath.target()?.id}));
  assert(!get('speak-answer').disabled,'Answer speech is disabled');
  selectTab('settings');assert(get('settings').classList.contains('active'),'Settings is inaccessible');
  selectTab('appearance');get('theme-select').value='warm';get('theme-select').dispatchEvent(new Event('change'));
  assert(document.body.dataset.theme==='warm','Appearance change failed');
  get('theme-select').value='light';get('theme-select').dispatchEvent(new Event('change'));
  selectTab('math');selectSubtab(document.querySelector('[data-subtab="functions"]'));
  showToolPage('function-define');get('function-rule').value='2x+3';get('save-function').click();
  showToolPage('function-evaluate');get('function-arguments').value='5';get('evaluate-function').click();
  assert(get('display').value==='13','Saved function evaluation failed');
  get('edit-function').click();assert(get('function-define').classList.contains('active'),'Edit did not return to Define');
  selectSubtab(document.querySelector('[data-subtab="discrete"]'));
  const sendResult=document.querySelector('[data-result-to-bar="discrete-result"]');
  selectDiscreteOperation('sum');
  const before=get('display').value;sendResult.click();
  assert(get('display').value===before,'Uncalculated result replaced input');
  get('discrete-calculate').click();sendResult.click();
  assert(get('display').value.includes('55'),'Discrete result did not reach speech bar');
  get('series-upper').focus();get('series-upper').value='3';get('series-upper').dispatchEvent(new Event('input',{bubbles:true}));
  sendResult.click();assert(get('display').value==='3','Stale result replaced edited input');
  get('discrete-calculate').click();sendResult.click();assert(get('display').value.includes('14'),'Updated sum failed');
  get('series-upper').focus();selectDiscreteOperation('union');
  assert(sharedMath.target()===null,'Hidden discrete field still receives keypad input');
  get('discrete-calculate').click();sendResult.click();assert(get('display').value.includes('{1, 2, 3, 4}'),'Set union failed');
  selectSubtab(document.querySelector('[data-subtab="algebra"]'));sharedMath.choose(null);sharedMath.erase(true);
  get('template-first').focus();sharedMath.edit('1');get('template-second').focus();sharedMath.edit('2');
  get('calculator-insert-template').click();get('shared-solve').click();assert(get('display').value==='0.5','Fraction builder failed');
  selectSubtab(document.querySelector('[data-subtab="calculus"]'));get('integral-example').click();
  get('shared-use-answer').click();assert(get('display').value==='9'&&get('shared-use-answer').hidden,'Use answer did not finish result reuse');
  selectSubtab(document.querySelector('[data-subtab="greek"]'));showToolPage('greek-common');
  [...get('greek-letters').children].find(b=>b.textContent.startsWith('Σ')).click();
  assert(get('discrete').classList.contains('active')&&get('discrete-operation').value==='sum','Sigma did not open sum editor');
  get('discrete-example').click();get('discrete-calculate').click();assert(get('discrete-result').textContent.endsWith('10'),'Sequence example failed');
  document.querySelector('[data-discrete-group="counting"]').click();
  assert(get('discrete-operation').options.length===2,'Counting choices are not focused');
  get('discrete-example').click();get('discrete-calculate').click();assert(get('discrete-result').textContent.endsWith('10'),'Team selection example failed');
  selectDiscreteOperation('permute');get('discrete-calculate').click();assert(get('discrete-result').textContent.endsWith('20'),'Ranking example failed');
  document.querySelector('[data-discrete-group="logic"]').click();get('discrete-example').click();get('discrete-calculate').click();
  assert(get('discrete-result').dataset.spoken.includes('is false.'),'Logic explanation missing');
  get('logic-p-text').value='The door is open';get('logic-p-text').dispatchEvent(new Event('input',{bubbles:true}));
  get('discrete-speak').click();assert(get('status').textContent.includes('Calculate a valid result'),'Edited logic could speak a stale result');
  sharedMath.choose(null);sharedMath.erase(true);selectTab('spell');
  const sentence="i need help, please.";
  for(const character of sentence){const key=[...document.querySelectorAll('[data-spell]')].find(b=>b.dataset.spell===character);assert(key,'Missing spelling key: '+character);key.click();}
  assert(get('display').value===sentence,'Spellboard inserted spaces between letters');
  const originalFetch=window.fetch,captured=[];
  window.fetch=(url,options)=>{captured.push(JSON.parse(options.body).text);return Promise.reject(Error('Test capture'));};
  try {
    document.querySelector('[data-action="speak"]').click();stopSpeaking();await Promise.resolve();
    assert(captured.length===1&&captured[0]===sentence,'Speak did not submit one complete sentence');
  } finally {window.fetch=originalFetch;}
  selectTab('math');selectSubtab(document.querySelector('[data-subtab="greek"]'));
  [...get('greek-letters').children].find(b=>b.textContent.startsWith('σ')).click();get('greek-example').click();
  get('save-function').click();showToolPage('function-evaluate');get('evaluate-function').click();
  assert(get('display').value==='1','Greek z-score example failed');
  sharedMath.choose(null);sharedMath.erase(true);return 'Math tools, Greek examples, discrete task groups, result speech guards, and whole-sentence spellboard passed';
 })()`);
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await run(`document.documentElement.style.setProperty('--font','18px');selectTab('math');sharedMath.choose(null);selectSubtab(document.querySelector('[data-subtab="basic"]'));`);
 fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'math-aac-basic.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 for(const panel of ['calculus','algebra','greek','discrete','functions','spell','settings','appearance']) {
  await run(panel==='settings'||panel==='appearance'||panel==='spell' ? `selectTab('${panel}')` : `selectTab('math');selectSubtab(document.querySelector('[data-subtab="${panel}"]'));`);
  if(panel==='greek')await run("showToolPage('greek-common')");
  await run('window.scrollTo(0,0)');
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'math-aac-'+panel+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 const offlineAssets = await run(`(async()=>{
  await navigator.serviceWorker.ready;
  const cache=await caches.open('math-aac-v33-accessible-tools');
  const assets=['index.html','styles.css?v=33','app.js?v=33','functions.js?v=33','workspace.js?v=33','manifest.json'];
  for(const asset of assets)if(!(await cache.match(asset)))throw Error('Missing offline asset: '+asset);
  return assets.length;
 })()`);
 await send('Network.setBypassServiceWorker',{bypass:false});
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 try {
  await send('Page.navigate',{url:'http://127.0.0.1:8766/index.html?offline-check'});
  await new Promise(r=>setTimeout(r,800));
  await run(`(()=>{document.getElementById('display').value='2+3';window.evaluate();if(document.getElementById('display').value!=='5')throw Error('Offline calculation failed');})()`);
 } finally {
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 }
 console.log(JSON.stringify({count,functional,offlineAssets,offlineCalculation:'passed',errors,failures},null,2));ws.close();if(errors.length||failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
