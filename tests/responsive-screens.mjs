import assert from "node:assert/strict";

const key = "neuronode-prototype-state-v4";
const viewports = [[667,375], [844,390], [390,844], [834,1194], [1180,820], [1366,650], [1920,1080]];

export async function finishReady(page) {
  for (let i=0; i<8 && await page.locator(".game-ready").count(); i++) {
    const before=await page.evaluate(()=>performance.now());
    await page.clock.runFor(470).catch(() => page.waitForTimeout(470));
    const after=await page.evaluate(()=>performance.now());
    // 未導入の仮想時計は最初のrunForで時刻を0へ戻す。実時間の押下ガードを逆行させない。
    if(after<before+450)await page.clock.runFor(Math.ceil(before+470-after)).catch(()=>page.waitForTimeout(470));
    if(!await page.locator('.game-ready').count())break;
    // 他の検査の遷移補助。実際のポインター・キー操作は入力安全性の検査で別に確認する。
    await page.locator("#gameReadyNext").evaluate(e=>e.click());
  }
  await page.locator(".game-ready").waitFor({state:"detached"});
}

export async function checkReadyInputSafety(page) {
  await page.evaluate(key=>{
    const state=JSON.parse(localStorage.getItem(key));
    Object.assign(state.settings,{speechEnabled:true,autoScan:false,textMode:"ruby"});
    localStorage.setItem(key,JSON.stringify(state));
  },key);
  await page.reload();
  await page.locator("#startStage").click();
  await open(page,"slot-corner");
  await open(page,"slot-l1");
  await page.locator(".game-ready").waitFor();
  const sessions=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.length,key);
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  assert(await page.locator(".game-ready").count(),"説明を終わる1押しで課題を開始しない");
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.length,key),sessions,"説明の押下は記録しない");
  await page.locator("#gameReadyNext").click();
  assert(await page.locator(".game-ready").count(),"連打で確認を飛ばさない");
  await finishReady(page);
  assert(await page.locator(".slot-task").count(),"支援者は固定の長い待ち時間なしに開始できる");
  await page.locator("#gameExit").click();

  // 自前走査とOS委譲を別々に確認する。説明の操作は入力面の兄弟として公開する。
  for(const switchControlMode of [false,true]) {
    await page.evaluate(({key,switchControlMode})=>{
      const state=JSON.parse(localStorage.getItem(key));
      Object.assign(state.settings,{speechEnabled:false,autoScan:true,scanInterval:500,switchControlMode});
      localStorage.setItem(key,JSON.stringify(state));
    },{key,switchControlMode});
    await page.reload();
    await page.locator("#startStage").click();
    await open(page,"slot-corner");await open(page,"slot-l1");
    await page.locator(".game-ready").waitFor();
    if(switchControlMode) {
      const tree=await page.locator("#gameView").ariaSnapshot();
      assert(tree.includes("始める")&&tree.includes("おわる"),"OSから開始と終了へ届く");
      await finishReady(page);
    } else {
      for(let i=0;i<8&&await page.locator(".game-ready").count();i++) {
        await page.waitForTimeout(500);
        await page.waitForFunction(()=>document.querySelector("#gameReadyNext").classList.contains("scan-focus"));
        await page.keyboard.press("Space");
      }
    }
    await page.locator(".game-ready").waitFor({state:"detached"});
    assert.equal(await page.locator("#gameView .scan-focus").count(),0,"課題を始めたら走査を止める");
    await page.locator("#gameExit").click();
  }
}

async function open(page, id) {
  for (let i=0; i<10; i++) {
    const tile=page.locator(`[data-tile-id="${id}"]`);
    if(await tile.count()) { await tile.evaluate(e=>e.click()); return; }
    await page.locator(".game-tile.scan-pager").evaluate(e=>e.click());
  }
  throw Error(`見つからない遊び: ${id}`);
}

export async function checkResponsiveScreens(page) {
  await page.addInitScript(() => {
    if (!window.AudioContext && !window.webkitAudioContext) {
      // Windows版のヘッドレスWebKitにはWeb Audio自体がない。
      // 版面用に予約時計だけを供給する。音が出るという実機の保証には使わない。
      const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
      const node=()=>({connect(){},disconnect(){},start(){},stop(){},addEventListener(){},gain:parameter(),frequency:parameter(),Q:parameter(),detune:parameter(),playbackRate:parameter()});
      window.AudioContext=class {
        sampleRate=44100;destination=node();state="running";
        get currentTime(){return performance.now()/1000;}
        resume(){return Promise.resolve();}
        createGain(){return node();} createOscillator(){return node();}
        createBufferSource(){return node();} createBiquadFilter(){return node();}
        createBuffer(channels,length){return {duration:length/this.sampleRate,getChannelData:()=>new Float32Array(length)};}
        decodeAudioData(){return Promise.resolve(this.createBuffer(1,4410));}
      };
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      Object.defineProperty(Audio.prototype,"currentTime",{get:()=>performance.now()/1000,configurable:true});
      // 版面検査の時計をWebKitでも進める。実際の音の可用性は別の検査が担う。
      Object.defineProperty(Audio.prototype,"state",{get:()=>"running",configurable:true});
    }
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  for(const [width,height] of viewports) for(const textMode of ["ruby","en"]) {
    await page.setViewportSize({width,height});
    await page.evaluate(({key,textMode})=>{
      const state=JSON.parse(localStorage.getItem(key));
      Object.assign(state.settings,{textMode,largeText:true,highContrast:true,speechEnabled:false,autoScan:false,fxLevel:"none",difficultyMode:"practice"});
      localStorage.setItem(key,JSON.stringify(state));
    },{key,textMode});
    await page.reload();
    await page.locator("#startStage").click({force:true});
    for(const game of ["slot-l1","slot-l2","crane","fishing","fishing-gonogo","gonogo"]) {
      if(game!=="gonogo") await open(page, game.startsWith("slot")?"slot-corner":game==="crane"?"crane-corner":"fishing-corner");
      await open(page,game);
      await page.clock.fastForward(500);
      for(let i=0; i<5; i++) {
        assert.equal(await page.locator('#gameReadyPage').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)','くっきり表示の説明ページ番号を白くする');
        const found=await page.evaluate(()=>{
          const selectors=[".game-ready-title",".game-ready-steps li:not([hidden])",".game-ready-go","#gameReadyNext","#gameExit"];
          const stage=document.querySelector(".game-ready").getBoundingClientRect();
          return selectors.flatMap(s=>[...document.querySelectorAll(s)]).filter(e=>e.getBoundingClientRect().width).map(e=>{
            const r=e.getBoundingClientRect();
            return {name:e.id||e.className,inside:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
              clips:e.matches("li")&&(r.top<stage.top-1||r.bottom>stage.bottom+1)};
          });
        });
        assert(found.every(e=>e.inside&&!e.clips),`${game} ${width}x${height} ${textMode}: ${JSON.stringify(found)}`);
        const label=await page.locator("#gameReadyNext").getAttribute("aria-label");
        if(!["次の説明","Next step"].includes(label)) break;
        await page.clock.fastForward(500);
        await page.locator("#gameReadyNext").evaluate(e=>e.click());
      }
      await page.clock.fastForward(500);
      await page.locator("#gameReadyNext").evaluate(e=>e.click());
      await page.locator(".game-ready").waitFor({state:"detached"});
      if(game==="crane") {
        const hidden=await page.locator(".crane-status").evaluate(e=>{
          const r=e.getBoundingClientRect();const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return !center?.closest(".crane-console")||r.bottom>innerHeight||r.top<60;
        });
        assert(!hidden,`アームの状態札が隠れる: ${width}x${height}`);
      }
      // 終了後の版面を検査する。経過時計で状態を進め、途中の全描画フレームは再生しない。
      for(let i=0; i<100&&!await page.locator("#resultView.is-active").count();i++) {
        await page.clock.fastForward(500);
        if(game==="crane") await page.locator("#gameStage").evaluate(e=>e.click());
        else await page.clock.fastForward(10000);
      }
      assert(await page.locator("#resultView.is-active").count(),`けっかに進まない: ${game} ${width}x${height} ${await page.locator("#gameStageContent").textContent()}`);
      await page.clock.fastForward(1000);
      const result=await page.evaluate(()=>{
        const controls=[...document.querySelectorAll("#resultRetry,#resultHome")].map(e=>{
          const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&r.width>=44&&r.height>=44;
        });
        const stats=document.querySelector("#resultStats");
        return {controls,overflow:stats.scrollHeight-stats.clientHeight};
      });
      assert(result.controls.every(Boolean),`けっかのボタン: ${game} ${width}x${height} ${textMode}`);
      assert(result.overflow<=2,`けっかが切れる: ${game} ${width}x${height} ${textMode} ${result.overflow}px`);
      for (const title of await page.locator("#resultView .hk-result-title").all()) {
        assert.equal(await title.evaluate(e=>getComputedStyle(e).color),"rgb(255, 255, 255)","くっきり表示の結果見出しを白くする");
      }
      await page.locator("#resultHome").evaluate(e=>e.click());
      console.log(`responsive ${width}x${height} ${textMode} ${game}: 説明・状態札・けっかの収まり`);
    }
  }
}
