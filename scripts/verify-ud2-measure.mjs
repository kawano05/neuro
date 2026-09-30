// gpt-b/capture.mjs の固定乱数・固定音時計・描画リセットを用いた、測定画面の RGB 比較。
// node scripts/verify-ud2-measure.mjs output/ud2/before-dist dist
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const roots = process.argv.slice(2);
if (roots.length !== 2) throw Error('Pass the before and after dist directories');
const output = 'output/playwright/ud2-measure';
const games = ['slot-l1', 'slot-l2', 'crane', 'fishing', 'fishing-gonogo', 'gonogo'];
const sizes = [[1180,820], [834,1194], [1366,650], [844,390], [667,375]];
const ports = [];
for (let i=0;i<2;i++) {
  const socket = createServer();
  await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  ports.push(socket.address().port);
  await new Promise(resolve=>socket.close(resolve));
}
const servers = roots.map((root, i) => spawn(process.execPath, ['scripts/serve-dist.mjs', root, String(ports[i])], { windowsHide:true, stdio:'inherit' }));
const browser = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--disable-gpu','--disable-threaded-animation','--disable-threaded-scrolling']});
const evidence = [];
const inputs = await Promise.all(roots.map(async (root,index) => {
  const html = await readFile(`${root}/index.html`, 'utf8');
  const asset = html.match(/assets\/[^" ]+\.js/)[0];
  return { root, port:ports[index], asset, sha256:createHash('sha256').update(await readFile(`${root}/${asset}`)).digest('hex') };
}));
try {
  for (const [index,port] of ports.entries()) for (let attempt=0; ; attempt++) {
    try {
      const served = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      const expected = await readFile(`${roots[index]}/index.html`, 'utf8');
      if (served.match(/assets\/[^" ]+\.js/)?.[0] === expected.match(/assets\/[^" ]+\.js/)?.[0]) break;
    } catch {}
    if (attempt >= 100) throw Error(`Server ${port} unavailable`);
    await delay(100);
  }
  for (let version=0; version<2; version++) {
    await mkdir(`${output}/${version}`, {recursive:true});
    for (const game of games) for (const [width,height] of sizes) {
      const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.addInitScript(() => {
        let seed=20260930;
        Math.random=()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
        const Context=window.AudioContext||window.webkitAudioContext;
        if(Context) Object.defineProperty(Context.prototype,'currentTime',{get:()=>performance.now()/1000,configurable:true});
        localStorage.clear();localStorage.setItem('neuronode-prototype-state-v4',JSON.stringify({version:4,settings:{difficultyMode:'measure',speechEnabled:false,autoScan:false}}));
      });
      const page = await context.newPage();
      const errors=[]; page.on('pageerror', error=>errors.push(error.message));
      try {
        await page.goto(`http://127.0.0.1:${ports[version]}/`);
        await page.locator('#startStage').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        await page.clock.install({time:new Date('2026-09-30T00:00:00Z')});
        await page.clock.pauseAt(new Date('2026-09-30T00:00:01Z'));
        const tick=ms=>page.clock.runFor(ms);
        const click=selector=>page.locator(selector).first().evaluate(el=>el.click());
        const open=async id=>{
          for(let i=0;i<8;i++) {
            if(await page.locator(`[data-tile-id="${id}"]`).count()){await click(`[data-tile-id="${id}"]`);await tick(550);return;}
            await click('.game-tile.scan-pager');await tick(300);
          }
          throw Error(`Missing tile ${id}`);
        };
        await page.keyboard.press('Space');await tick(550);
        if(game.startsWith('slot')) await open('slot-corner');
        else if(game==='crane') await open('crane-corner');
        else if(game.startsWith('fishing')) await open('fishing-corner');
        await open(game);
        await page.locator('.game-ready').waitFor();
        await tick(500);await page.keyboard.press('Space');await tick(32);
        for(const elapsed of [256,768,4608]) {
          const previous=elapsed===256?0:elapsed===768?256:768;
          await tick(elapsed-previous);
          await page.evaluate(async()=>{
            await document.fonts.ready;
            await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
            const display=document.body.style.display;
            document.body.style.display='none';void document.body.offsetHeight;
            document.body.style.display=display;void document.body.offsetHeight;
            for(const animation of document.getAnimations()){animation.pause();animation.currentTime=1000;}
          });
          const name=`${game}-${width}x${height}-${elapsed}`;
          await page.screenshot({path:`${output}/${version}/${name}.png`});
          evidence.push({version,name,errors:[...errors]});
        }
        console.log('captured', version, game, `${width}x${height}`);
      } finally { await context.close(); }
    }
  }
  await writeFile(`${output}/capture.json`,JSON.stringify({inputs,samples:evidence},null,2));
} finally {
  await browser.close();
  servers.forEach(server=>server.kill());
}
