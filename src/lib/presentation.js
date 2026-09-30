// 装飾だけを隔離する境目。判定・保存・課題の時計はここへ通さない。
// 同期例外と非同期の失敗を診断し、呼び元の入力・終了処理を続ける。
export function createPresentationBoundary(report = (label, error) => console.warn("[neuro:presentation]", label, error)) {
  const proxies = new WeakMap();
  const timers = new Map();
  let generation = 0;
  function run(label, action, fallback = undefined) {
    try {
      const result = action();
      if (result && typeof result.then === "function") return result.catch(error => {
        report(label, error);
        return fallback;
      });
      return result;
    } catch (error) {
      report(label, error);
      return fallback;
    }
  }
  function protect(target, label, excluded = []) {
    if (!target || typeof target !== "object") return target;
    if (proxies.has(target)) return proxies.get(target);
    const proxy = new Proxy(target, {
      get(object, key) {
        const value = object[key];
        if (excluded.includes(key)) return value;
        if (typeof value === "function") return (...args) => run(`${label}.${String(key)}`, () => value.apply(object, args), key === "level" ? "none" : undefined);
        return value && typeof value === "object" ? protect(value, `${label}.${String(key)}`) : value;
      },
    });
    proxies.set(target, proxy);
    return proxy;
  }
  function later(ms, action, win = window) {
    const current = generation;
    const id = win.setTimeout(() => {
      timers.delete(id);
      if (current === generation) run("timer", action);
    }, ms);
    timers.set(id, win);
    return id;
  }
  function cancelTimers() {
    generation += 1;
    timers.forEach((win, id) => win.clearTimeout(id));
    timers.clear();
  }
  function frame(action, win = window) {
    const current = generation;
    win.requestAnimationFrame(() => {
      if (current === generation) run("frame", action);
    });
  }
  return { run, protect, later, cancelTimers, frame };
}

export const presentation = createPresentationBoundary();
