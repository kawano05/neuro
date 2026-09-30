// 全遊び×4段×3実寸を撮る。はじめの遊びは実入力で完走し、
// 課題の結果は確定後の共通入口へ渡す治具で作る。
// 実際の入力・判定・保存はweb-smokeで別に検査し、この治具は配置と演出を検査する。
// テスト用ビルドだけに参照を公開し、製品には検査用の入口を残さない。
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const output = 'test-results/party-matrix';
mkdirSync(output,{recursive:true});
await build({build:{outDir:'test-results/party-visual-dist'},plugins:[{
  name:'party-visual-fixture',enforce:'pre',transform(code,id) {
    if(id.endsWith('/neuronodeApp.js')) return code.replace('ctx.gameHost = createGameHost(ctx);','globalThis.__partyCtx = ctx; ctx.gameHost = createGameHost(ctx);');
    if(id.endsWith('/gameHost.js')) return code.replace('elements.gameStageContent.dataset.atmosphere = atmosphere.profile.level;', 'globalThis.__partyStage = atmosphere; elements.gameStageContent.dataset.atmosphere = atmosphere.profile.level;').replace('getLastSummary: () => lastResultSummary,','getLastSummary: () => lastResultSummary, finishForTest: finishGame,');
  }
}]});
const server = spawn(process.execPath,['scripts/serve-dist.mjs','test-results/party-visual-dist','5192'],{windowsHide:true,stdio:'pipe'});
const browser = await chromium.launch();
const records=process.env.PARTY_RESUME ? JSON.parse(readFileSync(`${output}/checks.json`,'utf8')) : [];
try {
  for(let i=0;i<50;i++) { try {if((await fetch('http://127.0.0.1:5192/')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100)); }
  for(const [size,viewport] of [['ipad-landscape',{width:1180,height:820}],['ipad-portrait',{width:834,height:1194}],['phone-landscape',{width:844,height:390}]]) {
    for(const level of ['none','subtle','normal','big']) {
      for(const game of ['color-legacy','balloon','coloring','baseball','slot-l1','slot-l2','gonogo','crane','fishing','fishing-gonogo','crane-endless','fishing-endless']) {
        if(process.env.PARTY_GAMES && !process.env.PARTY_GAMES.split(',').includes(game)) continue;
        if(process.env.PARTY_CASE && !`${size}/${level}/${game}`.includes(process.env.PARTY_CASE)) continue;
        if(records.some(r=>r.size===size&&r.level===level&&r.game===game)) continue;
        const context=await browser.newContext({viewport});
        await context.addInitScript(({level})=>{
          Math.random=()=>0.314159;
          localStorage.setItem('neuronode-prototype-state-v3',JSON.stringify({settings:{fxLevel:level,autoScan:false,speechEnabled:false,soundEnabled:false}}));
        },{level});
        const page=await context.newPage();
        const errors=[]; page.on('pageerror',e=>errors.push(e.message));
        await page.goto('http://127.0.0.1:5192/');
        await page.locator('#startStage').click();
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now()+100));
        await page.evaluate(({game})=>{
          const ctx=window.__partyCtx;
          ctx.audio.scheduler.now=()=>performance.now()/1000;
          ctx.audio.scheduler.start=plan=>{plan.startAt=performance.now()/1000+0.12;return plan.startAt;};
          ctx.audio.scheduler.canSound=()=>true;
          ctx.gameHost.launch(game.replace('-endless',''),{endless:game.endsWith('-endless')});
          if(document.querySelector('.game-ready')) ctx.gameHost.dispatchInput(performance.now(),'test');
        },{game});
        await page.clock.runFor(100);
        const prefix=`${output}/${size}-${level}-${game}`;
        await page.screenshot({path:`${prefix}-during.png`});
        const placement=await page.evaluate(()=>{
          const layer=document.querySelector('.party-layer');
          const companions=[...document.querySelectorAll('.party-layer .party-otter,.party-layer .party-jar')];
          const obstacles=[...document.querySelectorAll('.balloon,.coloring-card,.bb-ball,.bb-bat,.slot-reels,.slot-target,.crane-stage,.fishing-scene,.rhythm-cabinet')];
          const visible=el=>el.getClientRects().length>0;
          const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
          return {live:Boolean(layer&&visible(layer)),moving:layer?layer.getAnimations({subtree:true}).filter(a=>a.playState==='running').length:0,overlaps:companions.filter(visible).flatMap(c=>obstacles.filter(visible).filter(o=>overlap(c.getBoundingClientRect(),o.getBoundingClientRect())).map(o=>`${c.className}/${o.className}`))};
        });
        const timing=!['color-legacy','balloon','coloring','baseball'].includes(game);
        if(timing) assert.equal(placement.moving,0,`${size}/${level}/${game}: 試行中の仲間が動いている`);
        if(level!=='big') assert.equal(placement.live,false);
        if(game!=='color-legacy') assert.deepEqual(placement.overlaps,[],`${size}/${level}/${game}: 主役と重なる`);
        // はじめの遊びは絵が出る・割れる・塗れる・飛ぶところも実際に描く。
        const pressBeginner = async () => {
          if(game==='baseball') {
            for(let i=0;i<100;i++) {
              if(await page.locator('.bb-word').textContent()==='') break;
              await page.clock.runFor(100);
            }
            await page.clock.runFor(300);
          }
          await page.evaluate(()=>window.__partyCtx.gameHost.dispatchInput(performance.now(),'test'));
        };
        if (!timing) await pressBeginner();
        else await page.evaluate(({game})=>{
          const source=document.querySelector(({'slot-l1':'.slot-reel','slot-l2':'.slot-reel',gonogo:'.rhythm-hit-line',crane:'.crane-prize',fishing:'.fishing-swimmer','fishing-gonogo':'.fishing-swimmer'})[game.replace('-endless','')])||document.querySelector('#gameStageContent');
          window.__partySource=source;
          window.__partyStage.react({index:0,source,success:true,total:5,endless:game.endsWith('-endless')});
        },{game});
        await page.clock.runFor(300);
        // 仮想時計とは別のWeb Animationsも押して300msの姿にそろえる。
        await page.evaluate(()=>{ void document.body.offsetWidth; document.getAnimations().forEach(a=>{
          const timing=a.effect?.getComputedTiming();
          if(timing?.iterations!==Infinity) {
            a.currentTime=Math.min(300, Math.max(0,a.effect.getTiming().delay+timing.activeDuration*0.8));
            a.pause();
          }
        }); });
        // なしの短い手応えは300msでは終わっている。CSSと個別scaleを重ねた
        // 停止画の合成層が透明な初期姿を保持しないよう、描画を静止へ戻す。
        if(game==='color-legacy' && level==='none') await page.locator('.pop-figure').evaluate(el=>{
          el.getAnimations().forEach(a=>a.finish());
          el.style.animation='none';
        });
        if(game==='color-legacy') assert.equal(await page.locator('.pop-figure').evaluate(el=>Number(getComputedStyle(el).opacity)>0),true,'押した動物を撮る');
        await page.waitForTimeout(100); // 停止した姿が合成層へ反映されるのを待つ。
        await page.screenshot({path:`${prefix}-pressed.png`});
        await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.playState==='paused')a.play();}));
        await page.clock.runFor(1500);
        if(!timing) {
          for(let i=1;i<5;i++) {
            await pressBeginner();
            if(i<4) await page.clock.runFor(1800);
          }
          if(game==='baseball') await page.clock.runFor(1400);
        } else await page.evaluate(({game})=>{
          for(let i=1;i<5;i++) window.__partyStage.react({index:i,source:window.__partySource,success:true,total:5,endless:game.endsWith('-endless')});
          const id=game.replace('-endless','');
          const summary=id==='crane'?{grips:5,trials:5}:id.startsWith('fishing')?{hits:5,catches:5,correctRejections:0,trials:5}:id.startsWith('slot')?{hits:5,trials:5}:{hits:5,misses:0,correctRejections:0,commissions:0};
          if(window.__partyStage.profile.reward) window.__partyCtx.gameHost.finishForTest(summary);
          else {
            window.__partyCtx.fx.finale(document.querySelector('#gameStageContent'),{});
            setTimeout(()=>window.__partyCtx.gameHost.finishForTest(summary),1500);
          }
        },{game});
        await page.clock.runFor(level==='big'?3000:100);
        await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.getComputedTiming().iterations!==Infinity)try{a.finish();}catch{}}));
        await page.waitForTimeout(100);
        await page.screenshot({path:`${prefix}-finale.png`});
        await page.clock.runFor(level==='big'?4600:1600);
        await page.clock.runFor(3000);
        // Playwrightの時計はWeb Animationsの時計を進めないため、表示の完了を明示する。
        await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.getComputedTiming().iterations!==Infinity)try{a.finish();}catch{}}));
        await page.waitForTimeout(100);
        await page.screenshot({path:`${prefix}-result.png`});
        const result=await page.evaluate(()=>({
          party:window.__partyCtx.gameHost.getLastSummary()?.party,
          research:window.__partyCtx.state.sessions.some(s=>'party' in (s.summary||{})),
          clothing:window.__partyCtx.state.party?.outfits||[],
          overflow:document.documentElement.scrollWidth>innerWidth+1,
          overflowElements:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.getAttribute('class'),right:el.getBoundingClientRect().right})).slice(0,15),
          result:document.querySelector('#resultView').classList.contains('is-active'),
          praise:document.querySelector('#resultStats [data-praise]')?.dataset.praise,
          rating:document.querySelectorAll('#resultStats .hk-star:not(.is-off)').length,
          completionStar:document.querySelectorAll('#resultStats .hk-result-medal').length,
          title:document.querySelector('#resultStats .hk-result-title')?.textContent || '',
          evaluationClear:(()=>{
            const primary=document.querySelector('.party-result.is-added > .hk-result');
            const companions=document.querySelector('.party-result.is-added > .party-result-main');
            if(!primary||!companions) return true;
            const a=primary.getBoundingClientRect(), b=companions.getBoundingClientRect();
            return a.right<=b.left || a.left>=b.right || a.bottom<=b.top || a.top>=b.bottom;
          })(),
          buttonsFit:[...document.querySelectorAll('#resultRetry,#resultHome')].every(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0&&r.left>=0&&r.right<=innerWidth+1;}),
        }));
        assert.equal(result.result,true);
        assert.equal(result.research,false);
        assert.equal(Boolean(result.party),level==='normal'||level==='big');
        assert.equal(result.clothing.length,level==='big'?1:0);
        assert.equal(result.overflow,false,`${size}/${level}/${game} ${JSON.stringify(result.overflowElements)}`);
        assert.equal(result.buttonsFit,true,`${size}/${level}/${game}: けっかのボタンが画面を出る`);
        if(timing) {
          assert.equal(result.praise,'result.praise.great',`${level}/${game}: 5回中5回の一言を保つ`);
          assert.equal(result.rating,3,`${level}/${game}: 3つ星の評価を保つ`);
        } else if(game!=='color-legacy'||level!=='big') {
          assert.ok(result.title.includes('できた'),`${level}/${game}: 完了の一言を保つ`);
          assert.equal(result.completionStar,1);
        }
        assert.equal(result.evaluationClear,true,`${size}/${level}/${game}: 評価とお祝いが重なる`);
        assert.deepEqual(errors,[]);
        records.push({size,level,game,placement,result});
        console.log('ok',size,level,game);
        await context.close();
      }
    }
  }
} finally {await browser.close();server.kill();writeFileSync(`${output}/checks.json`,JSON.stringify(records,null,2));}
console.log(`${records.length} layouts checked; ${records.length*4} screenshots`);
