// 成立確認（src/lib/readinessCheck.js）が実際に画面へ出るかの実測。
// 幾何や仕様からの推論では外すので、実物を開いて見る。
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 5629;
const basePath = "/neuro-shots/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, BASE_PATH: basePath },
});
server.stderr.on("data", (d) => process.stderr.write(d));
for (let i = 0; i < 60; i += 1) {
  try { if ((await fetch(baseUrl)).ok) break; } catch {}
  await delay(300);
}

const browser = await chromium.launch();

// state.js の sanitize は summary を trials から**作り直す**（保存された
// summary を信用しない）。なので根拠になる回は、実際の試行の形で作る。
function run(sessionId, taskType, gameId, trials, extra = {}) {
  return {
    sessionId,
    taskType,
    gameId,
    participantId: "P001",
    startedAtIso: "2026-08-17T00:00:00.000Z",
    aborted: false,
    finished: true,
    config: { difficultyMode: "practice", bpm: 50, mode: "continuous", ...extra },
    device: {},
    trials,
  };
}

const GONOGO_CONFIG = {
  mode: "gonogo",
  countInBeats: 3,
  targetBeats: 20,
  goRatio: 0.6,
  judgmentWindowMs: 600,
  effectiveWindowMs: 540,
  baselineOffsetMs: 0,
  seedSequence: [
    ...Array.from({ length: 12 }, () => "go"),
    ...Array.from({ length: 8 }, () => "nogo"),
  ],
};

const SMS_CONFIG = {
  mode: "continuous",
  countInBeats: 4,
  targetBeats: 16,
  judgmentWindowMs: 600,
  effectiveWindowMs: 540,
  baselineOffsetMs: 0,
  seedSequence: [],
};

const RT_CONFIG = {
  foreperiodMinMs: 1500,
  foreperiodMaxMs: 5000,
  limitMs: 2000,
  targetTrials: 10,
  fakeRatio: 0,
  seedSequence: Array.from({ length: 10 }, () => 1500),
  kindSequence: Array.from({ length: 10 }, () => "real"),
};

/** Go は押し、No-Go は見送る（＝高低を聞き分けている）回。 */
function gonogoTrials() {
  const trials = [];
  // 押した試行（hit / commission）は inputMs と rawOffsetMs を持ち、押して
  // いない試行（miss / correctRejection）は両方 null。食い違うと sanitize が
  // その行を落とし、回ごと中断へ倒れる。
  const pressed = (index, beatIndex, beatKind, judgment) => ({
    index,
    beatIndex,
    beatKind,
    scheduledMs: beatIndex * 1200,
    inputMs: beatIndex * 1200 + 40,
    rawOffsetMs: 40,
    appliedBaselineMs: 0,
    judgment,
    excluded: false,
  });
  const withheld = (index, beatIndex, beatKind, judgment) => ({
    index,
    beatIndex,
    beatKind,
    scheduledMs: beatIndex * 1200,
    inputMs: null,
    rawOffsetMs: null,
    appliedBaselineMs: 0,
    judgment,
    excluded: false,
  });
  for (let i = 0; i < 12; i += 1) {
    // Go は 11/12 で押せている。
    trials.push(
      i < 11 ? pressed(trials.length, i, "go", "hit") : withheld(trials.length, i, "go", "miss")
    );
  }
  for (let i = 0; i < 8; i += 1) {
    const beatIndex = 12 + i;
    // No-Go は 7/8 で見送れている（1回だけ つい押した）。
    trials.push(
      i < 7
        ? withheld(trials.length, beatIndex, "nogo", "correctRejection")
        : pressed(trials.length, beatIndex, "nogo", "commission")
    );
  }
  return trials;
}

/** 随意運動としてありうる反応時間の回。 */
function rtTrials(baseMs) {
  return Array.from({ length: 10 }, (_, index) => ({
    index,
    kind: "real",
    foreperiodMs: 1500,
    cueMs: 1800,
    inputMs: 1800 + baseMs + index * 8,
    reactionTimeMs: baseMs + index * 8,
    judgment: "hit",
    excluded: false,
  }));
}

/** ずれが一様分布よりずっと狭い＝合図に合わせている回。 */
function smsTrials(spreadMs) {
  return Array.from({ length: 16 }, (_, index) => {
    const raw = ((index % 4) - 1.5) * spreadMs;
    // カウントイン4拍のぶん後ろから始める。0拍目に早押しを置くと inputMs が
    // 負になり、sanitize がその行を落として回ごと中断へ倒れる。
    const scheduledMs = (index + 4) * 1200;
    return {
      index,
      beatIndex: index,
      beatKind: "go",
      scheduledMs,
      inputMs: scheduledMs + raw,
      rawOffsetMs: raw,
      appliedBaselineMs: 0,
      judgment: "hit",
      excluded: false,
    };
  });
}

// sanitize は「正常完了」の条件が厳しい（trials 数が config の計画と一致し、
// 拍計画が完全であること）。満たさない回は aborted に倒されるので、根拠にも
// ならない——ここはその条件を満たした回を作る。
const READY_SESSIONS = [
  run("g1", "gonogo", "gonogo", gonogoTrials(), GONOGO_CONFIG),
  run("g2", "gonogo", "gonogo", gonogoTrials(), GONOGO_CONFIG),
  run("t1", "rt", "fishing", rtTrials(600), RT_CONFIG),
  run("t2", "rt", "fishing", rtTrials(680), RT_CONFIG),
];

async function inspect(label, { sessions, difficultyMode }) {
  const context = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  await context.addInitScript(
    ({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); },
    {
      key: "neuronode-prototype-state-v3",
      value: JSON.stringify({
        version: 3,
        settings: { researcherMode: true, difficultyMode },
        evaluation: { participantId: "P001" },
        sessions,
      }),
    }
  );
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(400);
  await page.locator("#startStage").click();
  await page.waitForTimeout(300);
  // 支援者の世界へは、ホームのタップ専用メニューから入る（タブバーは
  // 利用者のホームでは出ていない）。
  await page.locator("#homeSupporterMenu").click();
  await page.waitForTimeout(400);

  const box = page.locator("#readinessCheck");
  const visible = await box.isVisible();
  const items = await page.locator(".readiness-item").allTextContents();
  const unmet = await page.locator(".readiness-item.is-unmet").count();
  const lead = (await page.locator("#readinessLead").textContent()) || "";

  console.log(`\n【${label}】difficultyMode=${difficultyMode}`);
  console.log(`  表示: ${visible}`);
  if (visible) {
    console.log(`  リード: ${lead.trim().slice(0, 60)}…`);
    console.log(`  未確認: ${unmet}件`);
    items.forEach((text) => console.log(`    - ${text.trim()}`));
  }
  await context.close();
  return { visible, unmet };
}

// 1. れんしゅうの回では出ない（関係がないので常設しない）。
const practice = await inspect("れんしゅう", { sessions: READY_SESSIONS, difficultyMode: "practice" });
// 2. そくていで、記録が足りない → 3つとも未確認。
const empty = await inspect("そくてい・記録なし", { sessions: [], difficultyMode: "measure" });
// 3. そくていで、リズムだけ足りない → 1つだけ未確認。
const partial = await inspect("そくてい・リズムだけ不足", {
  sessions: READY_SESSIONS,
  difficultyMode: "measure",
});
// 4. そくていで、3つとも足りている。
const full = await inspect("そくてい・3つとも確認できる", {
  sessions: [
    ...READY_SESSIONS,
    run("s1", "sms", "rhythm-l2", smsTrials(60), SMS_CONFIG),
    run("s2", "sms", "rhythm-l2", smsTrials(70), SMS_CONFIG),
  ],
  difficultyMode: "measure",
});

console.log("\n--- 判定 ---");
const ok =
  practice.visible === false &&
  empty.visible === true && empty.unmet === 3 &&
  partial.visible === true && partial.unmet === 1 &&
  full.visible === true && full.unmet === 0;
console.log(ok ? "期待どおり" : "期待と違う");

await browser.close();
server.kill();
process.exit(ok ? 0 : 1);
