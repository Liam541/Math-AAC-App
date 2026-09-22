/* Run with Playwright available in NODE_PATH and App/app.py on port 8766. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.spoken = [];
    const voices = [{ name: 'Test local voice', voiceURI: 'local:test', lang: 'en-US', localService: true, default: true }, { name: 'Test online voice', voiceURI: 'remote:test', lang: 'en-US', localService: false }];
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => voices, addEventListener: () => {}, cancel: () => {}, speak: u => { window.spoken.push(u.text); u.onstart?.(); } } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } } });
  });
  // Deterministic shell checks; verify the real Desmos page separately online.
  await context.route('https://www.desmos.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Desmos test placeholder</p>' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8766/index.html?v=22');
  await page.waitForSelector('#quick-phrases button');
  assert.equal(await page.locator('#chemistry').count(), 0);
  assert.equal(await page.locator('#engine-select').inputValue(), 'device');
  const click = action => page.locator(`[data-action="${action}"]:visible`).first().click();
  const preview = async name => {
    await page.evaluate(() => { scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path: path.join(__dirname, name), fullPage: true });
  };
  const tab = async name => {
    if (name === 'appearance') await page.locator('.main-tabs [data-tab="settings"]').click();
    await page.locator(`[data-tab="${name}"]:visible`).first().click();
  };
  const subtab = name => page.locator(`[data-subtab="${name}"]`).click();
  assert.equal(await page.locator('[data-tab]').evaluateAll(buttons => buttons.every(button => document.getElementById(button.dataset.tab)?.classList.contains('subject'))), true);
  // Every top-level destination and subtab must reveal a real panel.
  for (const destination of ['math', 'spell', 'communication', 'graphing', 'appearance', 'settings', 'history']) {
    await tab(destination); assert.equal(await page.locator('.subject.active').getAttribute('id'), destination);
  }
  await tab('graphing');
  assert.equal(await page.locator('#desmos').getAttribute('src'), 'https://www.desmos.com/calculator?embed');
  assert.equal(await page.locator('#display').isVisible(), true);
  await page.locator('#display').fill('2^3'); await click('speak');
  assert.match(await page.evaluate(() => window.spoken.at(-1)), /to the power of/);
  await tab('spell'); await tab('graphing');
  assert.equal(await page.locator('#display').inputValue(), '2^3');
  await preview('graph-desktop.png');
  await tab('math');
  for (const name of ['algebra', 'calculus', 'greek', 'functions', 'basic']) { await subtab(name); assert.equal(await page.locator('#math .subpanel.active').getAttribute('id'), name); }

  await page.locator('#display').fill('2^3^2'); await click('evaluate'); assert.equal(await page.locator('#display').inputValue(), '512');
  await page.locator('#display').fill('Ans/2'); await click('evaluate'); assert.equal(await page.locator('#display').inputValue(), '256');
  await click('angle'); await page.locator('#display').fill('sin(90)'); await click('evaluate'); assert.equal(await page.locator('#display').inputValue(), '1');
  await page.locator('#display').fill('1/0'); await click('evaluate'); assert.match(await page.locator('#status').textContent(), /undefined/);
  await tab('appearance'); await page.locator('#theme-select').selectOption('high'); await page.locator('#accent-select').selectOption('purple'); await page.locator('#icon-range').fill('36'); await tab('settings'); await page.locator('#auto-speak').uncheck(); await page.locator('#voice-select').selectOption('local:test');
  await tab('appearance'); await page.locator('[data-step="size-range"][data-delta="2"]').click(); await page.locator('[data-step="target-range"][data-delta="8"]').click();
  const sizeBefore = await page.locator('.main-tabs').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, height: el.firstElementChild.getBoundingClientRect().height }));
  await page.locator('#target-range').fill('112');
  const sizeAfter = await page.locator('.main-tabs').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, height: el.firstElementChild.getBoundingClientRect().height }));
  assert.ok(sizeAfter.columns < sizeBefore.columns, 'Larger buttons must wrap to fewer columns');
  assert.ok(sizeAfter.height > sizeBefore.height, 'Whole navigation buttons must grow in height');
  await page.locator('#target-range').fill('80');
  await preview('appearance-desktop.png');
  await page.reload(); await page.waitForSelector('#quick-phrases button');
  assert.equal(await page.locator('#icon-range').inputValue(), '36'); assert.equal(await page.locator('body').getAttribute('data-accent'), 'purple');
  assert.equal(await page.locator('body').getAttribute('data-theme'), 'high'); assert.equal(await page.locator('#size-range').inputValue(), '20'); assert.equal(await page.locator('#target-range').inputValue(), '80'); assert.equal(await page.locator('#voice-select').inputValue(), 'local:test'); assert.equal(await page.locator('#auto-speak').isChecked(), false);
  await page.locator('#quick-phrases button').first().click(); assert.equal(await page.evaluate(() => window.spoken.length), 0);
  await tab('spell'); await click('clear'); await page.locator('[data-spell="I"]').click(); await subtab('punctuation'); await page.locator('[data-spell="!"]').click(); await click('speak'); assert.equal(await page.evaluate(() => window.spoken.at(-1)), 'I!');
  await tab('math'); await page.locator('#display').fill('asin(1)^2'); await click('speak'); assert.match(await page.evaluate(() => window.spoken.at(-1)), /inverse sine.*to the power of/);
  await page.locator('#display').fill('abc'); await page.locator('#display').evaluate(el => el.setSelectionRange(1, 2)); await page.locator('[data-value="7"]').click(); assert.equal(await page.locator('#display').inputValue(), 'a7c'); await click('backspace'); assert.equal(await page.locator('#display').inputValue(), 'ac'); await click('undo'); assert.equal(await page.locator('#display').inputValue(), 'a7c');
  await tab('communication'); await page.locator('#phrase-input').fill('Please let me finish my proof.'); await click('save-phrase'); assert.equal(await page.locator('#quick-phrases button').count(), 8);
  await tab('settings'); await page.locator('#repeat-select').selectOption('600'); await tab('math'); await click('clear');
  await page.locator('[data-value="7"]').evaluate(el => { el.click(); el.click(); }); assert.equal(await page.locator('#display').inputValue(), '7');
  await tab('settings'); await page.locator('#repeat-select').selectOption('0'); await page.locator('#engine-select').selectOption('google');
  let calls = 0;
  await page.route('**/api/speak', async route => { calls++; await new Promise(resolve => setTimeout(resolve, 200)); await route.fulfill({ status: 503, body: '{}' }).catch(() => {}); });
  const before = await page.evaluate(() => window.spoken.length);
  await page.locator('#display').fill('stopped request'); await click('speak'); await click('stop'); await page.waitForTimeout(350); assert.equal(await page.evaluate(() => window.spoken.length), before);
  await page.locator('#display').fill('first message'); await click('speak'); await page.locator('#display').fill('latest message'); await click('speak'); await page.waitForTimeout(350); assert.equal(await page.evaluate(() => window.spoken.at(-1)), 'latest message'); assert.equal(await page.evaluate(() => window.spoken.length), before + 1); assert.ok(calls >= 2);
  await page.locator('#engine-select').selectOption('device'); await tab('appearance'); await page.locator('#theme-select').selectOption('light');
  await page.locator('#target-range').fill('72'); await page.locator('#size-range').fill('18');
  await tab('math'); await page.locator('#angle-mode').selectOption('rad'); await page.locator('#display').fill('sin(pi/2)+ln(e)'); await click('evaluate');
  await preview('calculator-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await preview('calculator-phone.png');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await tab('appearance'); await page.locator('#target-range').fill('112'); await page.locator('#size-range').fill('28'); await page.locator('#gap-range').fill('24');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(await page.locator('[data-step="size-range"]').first().evaluate(el => el.getBoundingClientRect().height >= 112));
  await page.evaluate(() => localStorage.setItem('math-aac-settings', '{broken'));
  await page.reload(); await page.waitForSelector('#quick-phrases button'); assert.equal(await page.locator('#engine-select').inputValue(), 'device');
  assert.deepEqual(errors, []);
  // Verify the actual service worker precaches the versioned scripts and excludes API status.
  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto('http://127.0.0.1:8766/manifest.json');
  await offlinePage.evaluate(async () => {
    const oldCache = await caches.open('math-aac-v18');
    await oldCache.put('/index.html', new Response('<button>Chemistry</button>'));
  });
  await offlinePage.goto('http://127.0.0.1:8766/index.html?v=22');
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.reload();
  await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await offlinePage.evaluate(async () => (await caches.keys()).includes('math-aac-v18')), false);
  const cached = await offlinePage.evaluate(async () => {
    const cache = await caches.open('math-aac-v22'); return (await cache.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search);
  });
  assert.ok(cached.includes('/math.js?v=22')); assert.ok(cached.includes('/speech.js?v=22')); assert.ok(!cached.includes('/api/tts-status'));
  await offlineContext.setOffline(true); await offlinePage.reload(); await offlinePage.waitForSelector('#quick-phrases button');
  await offlinePage.locator('#display').fill('2+2'); await offlinePage.locator('[data-action="evaluate"]').first().click(); assert.equal(await offlinePage.locator('#display').inputValue(), '4');
  await browser.close();
  console.log('Browser checks passed: calculator, Desmos portal, settings, phrases, editing, repeat guard, speech cancellation/fallback, mobile sizing, corrupt storage.');
})().catch(error => { console.error(error); process.exit(1); });
