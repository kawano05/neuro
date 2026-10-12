// =====================================================================
// presentation.js — 演出だけを閉じ込める境目
//
// 演出（粒・舞台・世界の絵・音楽・声）が例外を出しても、遊びと記録は止めない
// （docs/rules/ud-checklist.md の C1）。演出の呼び出しはここを通し、失敗は診断に
// 書いて、代わりの値（fallback）で呼び元を続ける。
//
// 判定・保存・課題の時計（合図の音の予約など）は、ここへ通さない。そこで起きた
// 失敗を黙って飲み込むと、記録が壊れたまま続いてしまう。protect の passThrough に
// 挙げるのは、そのための「素通しの口」。
//
// タイマーと rAF（later / frame）は、遊びを抜けるときに cancelTimers でまとめて
// 無効にする（予約した演出が次の画面で起きないように。C5）。
// =====================================================================

/**
 * @param {(label: string, error: unknown) => void} report 失敗の書き出し先
 */
export function createPresentationBoundary(report = (label, error) => console.warn("[neuro:presentation]", label, error)) {
  const proxies = new WeakMap();
  const timers = new Map();
  let generation = 0;

  /**
   * action を呼ぶ。同期の例外も、返した Promise の失敗も、report して fallback を返す。
   * @template T
   * @param {string} label 診断に出す名前（"fx.frame" など）
   * @param {() => T} action
   * @param {T} [fallback]
   */
  function run(label, action, fallback = undefined) {
    try {
      const result = action();
      if (result && typeof result.then === "function") {
        return result.catch((error) => {
          report(label, error);
          return fallback;
        });
      }
      return result;
    } catch (error) {
      report(label, error);
      return fallback;
    }
  }

  /**
   * オブジェクトの関数を、すべて run を通して呼ぶ形に包む（入れ子のオブジェクトも）。
   * @param {object} target
   * @param {string} label
   * @param {object} [options]
   * @param {string[]} [options.passThrough] 包まずに渡す口（課題の時計など、失敗を隠してはいけないもの）
   * @param {Record<string, unknown>} [options.fallbacks] 失敗したときに返す値（口の名前ごと）
   */
  function protect(target, label, { passThrough = [], fallbacks = {} } = {}) {
    if (!target || typeof target !== "object") return target;
    if (proxies.has(target)) return proxies.get(target);
    const proxy = new Proxy(target, {
      get(object, key) {
        const value = object[key];
        if (passThrough.includes(key)) return value;
        const name = `${label}.${String(key)}`;
        if (typeof value === "function") return (...args) => run(name, () => value.apply(object, args), fallbacks[key]);
        return value && typeof value === "object" ? protect(value, name) : value;
      },
    });
    proxies.set(target, proxy);
    return proxy;
  }

  /** setTimeout の代わり。cancelTimers のあとは起きない。 */
  function later(ms, action, win = window) {
    const current = generation;
    const id = win.setTimeout(() => {
      timers.delete(id);
      if (current === generation) run("timer", action);
    }, ms);
    timers.set(id, win);
    return id;
  }

  /** 予約した演出（later と frame）をまとめて無効にする。遊びを抜けるときに呼ぶ。 */
  function cancelTimers() {
    generation += 1;
    timers.forEach((win, id) => win.clearTimeout(id));
    timers.clear();
  }

  /** requestAnimationFrame の代わり。cancelTimers のあとは起きない。 */
  function frame(action, win = window) {
    const current = generation;
    win.requestAnimationFrame(() => {
      if (current === generation) run("frame", action);
    });
  }

  return { run, protect, later, cancelTimers, frame };
}

export const presentation = createPresentationBoundary();
