// A light screen recorder for one bot window, instead of OBS: Chrome's own screencast (CDP Page.startScreencast)
// hands over each rendered frame as JPEG, and ffmpeg encodes them as HEVC on the graphics card's video encoder (NVENC),
// which is separate from the 3D work. Several bots can record at once (driver 537: five NVENC sessions).
// Frames are written at a steady rate (the newest frame is repeated when the page has not drawn a new one), so the
// video plays in real time. No audio: the clips get music in post-production.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

// ffmpeg 7+ wants driver 570+ for NVENC; this PC's driver 537 works with the ffmpeg 6.1 build kept in tools/.
const FFMPEG = process.env.FFMPEG ?? (existsSync('D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe') ? 'D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe' : 'C:/ffmpeg/ffmpeg.exe');

/** Frames waiting for ffmpeg beyond this many bytes (several seconds of video) are dropped rather than kept in memory. */
const BACKLOG = 64 * 1024 * 1024;

/** Whether NVENC opens with this ffmpeg and driver (checked once: a tiny test encode; no answer in 10 s means no). */
let nvencOk;
export function nvencWorks(ffmpeg = FFMPEG) {
  if (nvencOk === undefined) { const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.2', '-c:v', 'hevc_nvenc', '-f', 'null', '-'], { timeout: 10000 }); nvencOk = !r.error && r.status === 0; }
  return nvencOk;
}

/**
 * Start recording `page` into `file` (mp4). Returns { stop() } that finishes the file and resolves with stats.
 * fps 30; size 1920x1080 (the window renders 1536x864 at scale 1.25); encoder hevc_nvenc, or libx264 as a fallback.
 */
export async function startRecording(page, file, { ffmpeg: binary = FFMPEG, fps = 30, width = 1920, height = 1080, seconds = 0, encoder = nvencWorks(binary) ? 'hevc_nvenc' : 'libx264', log = () => {}, preview } = {}) {
  // HEVC at constant quality 30: about 1 GB per hour, a third of H.264 at the same look (light uploads; YouTube
  // re-encodes anyway). hvc1 tag: plays on Apple devices too. CPU fallback: H.264 at a similar size.
  const video = encoder === 'hevc_nvenc' ? ['-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '30', '-b:v', '0', '-tag:v', 'hvc1'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28'];
  const ffmpeg = spawn(binary, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    ...video, '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '', broken = false; ffmpeg.stderr.on('data', d => { errors += d; });
  // ffmpeg gone (not found, blocked, a bad encoder, a full disk): stop feeding it, keep the bot playing, report it.
  const fail = why => { if (!broken) { broken = true; log(`recording stopped: ${why} (playing on without video)`); } };
  ffmpeg.stdin.on('error', error => fail(`ffmpeg input ${error.code ?? error.message}`));
  // A program that never started has no 'exit': 'error' and 'close' end the wait as well.
  const exited = new Promise(resolve => {
    ffmpeg.on('exit', code => resolve(code));
    ffmpeg.on('close', code => resolve(code));
    ffmpeg.on('error', error => { errors += `${error.code ?? ''} ${error.message}`; fail(`ffmpeg ${error.code ?? error.message}`); resolve(null); });
  });
  ffmpeg.on('exit', code => { if (code && !stopped) fail(`ffmpeg exit ${code}`); });

  const cdp = await page.context().newCDPSession(page);
  let latest = null, received = 0, written = 0, slots = 0, dropped = 0, stopped = false;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    latest = Buffer.from(data, 'base64'); received++;
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: width, maxHeight: height, everyNthFrame: 1 });

  // Real-time pacing: as many frames as the clock says, each the newest one received. With `seconds` the file ends
  // at exactly that length (60:00 = 108000 frames at 30 fps) while the bot finishes what it was doing, unrecorded.
  const started = Date.now(), limit = seconds > 0 ? Math.round(seconds * fps) : Infinity;
  let full = false, previewAt = 0;
  /** Frames up to the clock (at most the limit); at the limit the file is closed with exactly `limit` frames. */
  const feed = () => {
    const due = Math.min(limit, Math.floor((Date.now() - started) * fps / 1000));
    while (slots < due) {
      slots++;
      // ffmpeg far behind (more than BACKLOG waiting in the pipe): frames are skipped until it catches up, so memory
      // cannot pile up. (write() alone says "full" after every frame: one JPEG is larger than the pipe's 16 KB mark.)
      if (ffmpeg.stdin.writableLength > BACKLOG) { if (!dropped++) log('recording: ffmpeg is behind, dropping frames'); continue; }
      ffmpeg.stdin.write(latest); written++;
    }
    if (slots >= limit) {
      // Frames skipped while ffmpeg was behind are made up with the last one, so the video is exactly `seconds` long.
      while (written < limit) { ffmpeg.stdin.write(latest); written++; }
      full = true; ffmpeg.stdin.end(); log(`recording reached ${seconds}s`);
    }
  };
  const tick = setInterval(() => {
    if (stopped || broken || full || !latest) return;
    feed();
    // A small still for the desktop app's live view, every few seconds.
    if (preview && Date.now() - previewAt > 4000) { previewAt = Date.now(); writeFile(preview, latest).catch(() => {}); }
  }, Math.round(1000 / fps / 2));
  log(`recording → ${file} (${encoder})`);

  let stopping = null;
  return {
    file, started,
    get full() { return full; },
    get broken() { return broken; },
    /** Finish the file (safe to call more than once, and after ffmpeg has gone). */
    stop() {
      return stopping ??= (async () => {
        clearInterval(tick);
        // The frames the clock is owed since the last tick (a clip at its end is filled up to its exact length).
        if (!broken && !full && latest) feed();
        stopped = true;
        await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {});
        if (!broken && !full) ffmpeg.stdin.end();
        const code = await exited;
        const stats = { file, seconds: Math.round((Date.now() - started) / 1000), frames: written, dropped, received, code, broken, errors: errors.trim() };
        log(`recording ${broken ? 'failed' : 'saved'}: ${stats.seconds}s, ${written} frames written${dropped ? `, ${dropped} dropped` : ''}, ${received} drawn${code || broken ? ` · ffmpeg ${code ?? 'failed'}: ${stats.errors}` : ''}`);
        return stats;
      })();
    },
  };
}
