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
 await send('Page.navigate',{url:'http://127.0.0.1:8766/index%20(1).html'});
 await new Promise(r=>setTimeout(r,800));
 const failures=[];let count=0;
 for(const [width,height] of [[1280,650],[1280,720],[1366,650],[1920,1080]]) for(const size of [18,24]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await run(`document.documentElement.style.setProperty('--font','${size}px'); selectTab('math');selectSubtab(document.querySelector('[data-subtab="calculus"]')); document.getElementById('integral-expression').focus();`);
  const views=await run(`Array.from(document.querySelectorAll('[data-subtab]')).map(x=>({tab:x.dataset.subtab,pages:Array.from(document.getElementById(x.dataset.subtab).querySelectorAll('.tool-page')).map(p=>p.id)}))`);
  const inspect=async name=>{
   count++;
   const issues=await run(`(()=>{window.scrollTo(0,0);const bad=[];for(const el of document.querySelectorAll('button,input,select')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;if(r.bottom>innerHeight+.5||r.right>innerWidth+.5||r.top<0||r.left<0)bad.push((el.id||el.textContent.trim())+': outside '+Math.round(r.bottom));const panel=el.closest('.tool-panels');if(panel&&r.bottom>panel.getBoundingClientRect().bottom)bad.push((el.id||el.textContent.trim())+': outside panel');const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit&&!el.contains(hit))bad.push((el.id||el.textContent.trim())+': covered');if(r.height<44 && el.type!=='checkbox')bad.push((el.id||el.textContent.trim())+': small '+r.height);}return {bad,overflow:document.documentElement.scrollHeight>innerHeight+1};})()`);
   if(issues.bad.length||issues.overflow)failures.push({width,height,size,name,...issues});
  };
  for(const view of views){await run(`selectSubtab(document.querySelector('[data-subtab="${view.tab}"]'))`);for(const page of view.pages.length?view.pages:[null]){if(page)await run(`showToolPage('${page}')`);await inspect(page||view.tab);if(view.tab==='discrete'){for(const op of ['product','choose','permute','union','intersection','difference','and','or','implies']){await run(`document.getElementById('discrete-operation').value='${op}';document.getElementById('discrete-operation').onchange();document.getElementById('discrete-calculate').click();`);await inspect('discrete-'+op);}await run(`document.getElementById('discrete-operation').value='sum';document.getElementById('discrete-operation').onchange();`);}}}
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
  sharedMath.choose(null);sharedMath.erase(true);return 'Greek integral, answer speech, Settings, Appearance, and function editing passed';
 })()`);
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:650,deviceScaleFactor:1,mobile:false});
 await run(`document.documentElement.style.setProperty('--font','18px');selectTab('math');sharedMath.choose(null);selectSubtab(document.querySelector('[data-subtab="basic"]'));`);
 fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'math-aac-basic.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 for(const panel of ['calculus','functions','settings','appearance']) {
  await run(panel==='settings'||panel==='appearance' ? `selectTab('${panel}')` : `selectTab('math');selectSubtab(document.querySelector('[data-subtab="${panel}"]'));`);
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'math-aac-'+panel+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 console.log(JSON.stringify({count,functional,errors,failures},null,2));ws.close();if(errors.length||failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
