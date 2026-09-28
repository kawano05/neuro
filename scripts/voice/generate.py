# =====================================================================
# scripts/voice/generate.py — 声のパック（src/assets/voice/）を作る
#
#   node scripts/voice/lines.mjs              （読み上げる文の一覧を作り直す）
#   python scripts/voice/generate.py          （足りない音を作り、パックにまとめる）
#
# 日本語は VOICEVOX（ローカルで動かしたエンジン、既定 http://127.0.0.1:50021）、
# 英語は Kokoro（Apache-2.0。pip install "kokoro>=0.9.4" "misaki[en]>=0.9.4"）で作る。
# 作った音は文ごとに test-results/voice-cache/ に取っておき（同じ文・同じ声なら作り直さない）、
# 言語ごとに1つのファイル（ja.bin / en.bin。mp3 をつないだもの）と、文 → 位置の表
# （index.json）にまとめる。アプリはこの表で文を引く（src/lib/voicePack.js）。
#
# 声を替えるときは VOICES を直す（下の説明）。クレジットは src/lib/soundCredits.js。
# 要るもの: ffmpeg、numpy、soundfile（と上の Kokoro）。
#
# 大きさ: iPad の内蔵スピーカー相当（300Hz より下が出ない）で、いちばん大きい
# 100ms の RMS が TARGET_ST_DB になるようにそろえる。これまでの端末の読み上げ
# （test-results/probe-loudness.mjs で −14.8〜−15.8dBFS）と同じくらいにして、
# 効果音との釣り合い（docs §3.17）を変えない。
# =====================================================================

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LINES = os.path.join(ROOT, "scripts", "voice", "lines.json")
# 読みの指定（VOICEVOX がふりがなと違う読みをする言葉。check-readings.mjs で見つける）。
READINGS = os.path.join(ROOT, "scripts", "voice", "readings.json")
OUT_DIR = os.path.join(ROOT, "src", "assets", "voice")
CACHE_DIR = os.path.join(ROOT, "test-results", "voice-cache")

RATE = 24000
TARGET_ST_DB = -15.0
PEAK_LIMIT = 0.89  # -1 dBFS
MP3_BITRATE = "48k"
# 頭と終わりに残す無音（秒）。文と文の間はアプリが置く（voicePack.js の chunkGapS）。
LEAD_S = 0.02
TAIL_S = 0.05

# 声。替えるときは、ここと soundCredits.js のクレジットを一緒に直す。
#   ja: VOICEVOX の話者の番号（style id）。2 = 四国めたん（ノーマル）。
#       四国めたんは東北ずん子・ずんだもんプロジェクトの声で、アプリへの組み込みが
#       できて（クレジット「VOICEVOX:四国めたん」が要る）、再配布を禁じていない。
#       春日部つむぎ（二次配布禁止）・No.7（商用は事前確認）などは、公開リポジトリに
#       置くこのアプリには合わない（docs/design-renewal-2026-09-25.md §3.20）。
#   en: Kokoro の声。af_heart は Kokoro でいちばん評価の高い声（米国英語・女性）。
VOICES = {
    "ja": {
        "engine": "VOICEVOX",
        "speaker": 2,
        "name": "四国めたん（ノーマル）",
        "credit": "VOICEVOX:四国めたん",
        # 子どもにも聞き取りやすいよう少しゆっくり、抑揚は少し大きめ。
        "speedScale": 0.95,
        "intonationScale": 1.2,
        # 「！」で終わる文（やったー！・つかんだ！）は、はずませる。
        "excitedIntonationScale": 1.4,
        "excitedPitchScale": 0.03,
    },
    "en": {
        "engine": "Kokoro-82M",
        "voice": "af_heart",
        "name": "Kokoro af_heart",
        "credit": "Kokoro-82M (af_heart), Apache-2.0",
        "speed": 0.95,
    },
}


def run(cmd, data=None):
    return subprocess.run(cmd, input=data, capture_output=True, check=True).stdout


# ---------------------------------------------------------------- 日本語（VOICEVOX）

def voicevox_url(base, path, params):
    return f"{base}{path}?{urllib.parse.urlencode(params)}"


def voicevox_post(base, path, params, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else b""
    request = urllib.request.Request(
        voicevox_url(base, path, params), data=data, method="POST", headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def is_excited(text):
    return text.rstrip("」』）)").endswith(("！", "!"))


def synth_ja(text, cfg, base):
    speaker = cfg["speaker"]
    query = json.loads(voicevox_post(base, "/audio_query", {"text": text, "speaker": speaker}))
    query["speedScale"] = cfg["speedScale"]
    excited = is_excited(text)
    query["intonationScale"] = cfg["excitedIntonationScale"] if excited else cfg["intonationScale"]
    query["pitchScale"] = cfg["excitedPitchScale"] if excited else 0.0
    query["prePhonemeLength"] = 0.1
    query["postPhonemeLength"] = 0.1
    query["outputSamplingRate"] = RATE
    wav = voicevox_post(base, "/synthesis", {"speaker": speaker}, query)
    audio, rate = sf.read(io.BytesIO(wav), dtype="float32")
    assert rate == RATE, rate
    return audio if audio.ndim == 1 else audio.mean(axis=1), query.get("kana", "")


# ---------------------------------------------------------------- 英語（Kokoro）

_kokoro = None


def synth_en(text, cfg):
    global _kokoro
    if _kokoro is None:
        from kokoro import KPipeline

        # CPU で動かす（GPU の版の torch では、最初の1文で止まったように長く待たされた）。
        _kokoro = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device="cpu")
    parts = []
    for _, _, audio in _kokoro(text, voice=cfg["voice"], speed=cfg["speed"]):
        parts.append(audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio))
    return np.concatenate(parts).astype("float32"), ""


# ---------------------------------------------------------------- 仕上げ

def highpass_300(x):
    # iPad の内蔵スピーカーのかわり（2次の高域通過、RBJ の式。probe-loudness.mjs と同じ）。
    w0 = 2 * np.pi * 300 / RATE
    alpha = np.sin(w0) / (2 * 0.7)
    cos = np.cos(w0)
    a0 = 1 + alpha
    b0, b1, b2 = (1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0
    a1, a2 = -2 * cos / a0, (1 - alpha) / a0
    from scipy.signal import lfilter

    return lfilter([b0, b1, b2], [1.0, a1, a2], x)


def loudest_100ms_db(x):
    win = int(RATE * 0.1)
    if len(x) <= win:
        rms = np.sqrt(np.mean(x ** 2)) if len(x) else 0.0
    else:
        power = np.convolve(x ** 2, np.ones(win) / win, mode="valid")
        rms = np.sqrt(power.max())
    return 20 * np.log10(max(rms, 1e-9))


def finish(audio):
    audio = np.asarray(audio, dtype="float64")
    # 頭と終わりの無音を削る（いちばん大きいところから −45dB より小さいところ）。
    envelope = np.abs(audio)
    threshold = envelope.max() * (10 ** (-45 / 20))
    loud = np.where(envelope > threshold)[0]
    if len(loud):
        start = max(0, loud[0] - int(LEAD_S * RATE))
        end = min(len(audio), loud[-1] + int(TAIL_S * RATE))
        audio = audio[start:end]
    # 大きさをそろえる。
    gain_db = TARGET_ST_DB - loudest_100ms_db(highpass_300(audio))
    audio = audio * (10 ** (gain_db / 20))
    peak = np.abs(audio).max()
    if peak > PEAK_LIMIT:
        audio = audio * (PEAK_LIMIT / peak)
    # 端のプツッを消す（5ms）。
    fade = int(0.005 * RATE)
    if len(audio) > fade * 2:
        ramp = np.linspace(0, 1, fade)
        audio[:fade] *= ramp
        audio[-fade:] *= ramp[::-1]
    return audio.astype("float32")


def to_mp3(audio):
    buf = io.BytesIO()
    sf.write(buf, audio, RATE, format="WAV", subtype="PCM_16")
    return run(
        ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-map_metadata", "-1", "-id3v2_version", "0",
         "-write_xing", "0", "-ac", "1", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-f", "mp3", "pipe:1"],
        buf.getvalue(),
    )


def load_readings():
    table = json.load(open(READINGS, encoding="utf-8"))
    return {lang: table.get(lang, {}) for lang in ("ja", "en")}


def with_readings(text, table):
    """声に渡す書き方（長い言葉から置きかえる）。アプリが引く文（キー）は変えない。"""
    for word in sorted(table, key=len, reverse=True):
        text = text.replace(word, table[word])
    return text


def cache_key(lang, text):
    cfg = json.dumps(VOICES[lang], sort_keys=True, ensure_ascii=False)
    params = f"{TARGET_ST_DB}|{MP3_BITRATE}|{LEAD_S}|{TAIL_S}"
    return hashlib.sha1(f"{lang}\n{cfg}\n{params}\n{text}".encode("utf-8")).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voicevox", default="http://127.0.0.1:50021")
    parser.add_argument("--only", choices=["ja", "en"], help="片方の言語だけ作る（もう片方はキャッシュから）")
    parser.add_argument(
        "--cached-only",
        action="store_true",
        help="新しく作らず、できている音だけでパックを組む（作りかけのときに試すため。入れないこと）",
    )
    args = parser.parse_args()

    lines = json.load(open(LINES, encoding="utf-8"))
    readings_table = load_readings()
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    index = {"version": 1, "voices": {}, "clips": {}}
    readings = {}
    for lang in ("ja", "en"):
        cfg = VOICES[lang]
        index["voices"][lang] = {k: cfg[k] for k in ("engine", "name", "credit")}
        clips = {}
        pack = bytearray()
        made = 0
        for entry in lines[lang]:
            text = entry["text"]
            spoken = with_readings(text, readings_table[lang])
            key = cache_key(lang, spoken)
            path = os.path.join(CACHE_DIR, f"{lang}-{key}.mp3")
            if not os.path.exists(path):
                if args.cached_only:
                    continue
                if args.only and args.only != lang:
                    raise SystemExit(f"missing cache for {lang}: {text}")
                if lang == "ja":
                    audio, kana = synth_ja(spoken, cfg, args.voicevox)
                    readings[text] = kana
                else:
                    audio, _ = synth_en(spoken, cfg)
                data = to_mp3(finish(audio))
                with open(path + ".tmp", "wb") as f:
                    f.write(data)
                os.replace(path + ".tmp", path)
                made += 1
                if made % 25 == 0:
                    print(f"  {lang}: {made} made", file=sys.stderr, flush=True)
            data = open(path, "rb").read()
            clips[text] = [len(pack), len(data)]
            pack.extend(data)
        with open(os.path.join(OUT_DIR, f"{lang}.bin"), "wb") as f:
            f.write(pack)
        index["clips"][lang] = clips
        print(f"{lang}: {len(clips)} clips, {made} new, {len(pack) / 1024:.0f} KB")
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    if readings:
        with open(os.path.join(CACHE_DIR, "readings-ja.json"), "w", encoding="utf-8") as f:
            json.dump(readings, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
