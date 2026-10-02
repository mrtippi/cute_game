// A light screen recorder for one bot window, instead of OBS: Chrome's own screencast (CDP Page.startScreencast)
// hands over each rendered frame as JPEG, and ffmpeg encodes them as HEVC on the graphics card's video encoder (NVENC),
// which is separate from the 3D work. Several bots can record at once (driver 537: five NVENC sessions).
// Frames are written at a steady rate (the newest frame is repeated when the page has not drawn a new one), so the
// video plays in real time. No audio: the clips get music in post-production.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ffmpeg 7+ wants driver 570+ for NVENC; this PC's driver 537 works with the ffmpeg 6.1 build kept in tools/.
const FFMPEG = process.env.FFMPEG ?? (existsSync('D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe') ? 'D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe' : 'C:/ffmpeg/ffmpeg.exe');

/** Whether NVENC opens with this ffmpeg and driver (checked once: a tiny test encode). */
let nvencOk;
export function nvencWorks() {
  if (nvencOk === undefined) { const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.2', '-c:v', 'hevc_nvenc', '-f', 'null', '-']); nvencOk = r.status === 0; }
  return nvencOk;
}

/**
 * Start recording `page` into `file` (mp4). Returns { stop() } that finishes the file and resolves with stats.
 * fps 30; size 1920x1080 (the window renders 1536x864 at scale 1.25); encoder hevc_nvenc, or libx264 as a fallback.
 */
export async function startRecording(page, file, { fps = 30, width = 1920, height = 1080, encoder = nvencWorks() ? 'hevc_nvenc' : 'libx264', log = () => {} } = {}) {
  // HEVC at constant quality 30: about 1 GB per hour, a third of H.264 at the same look (light uploads; YouTube
  // re-encodes anyway). hvc1 tag: plays on Apple devices too. CPU fallback: H.264 at a similar size.
  const video = encoder === 'hevc_nvenc' ? ['-c:v', 'hevc_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '30', '-b:v', '0', '-tag:v', 'hvc1'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28'];
  const ffmpeg = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    ...video, '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '', broken = false; ffmpeg.stderr.on('data', d => { errors += d; });
  // ffmpeg gone (a bad encoder, a full disk): stop feeding it, keep the bot playing, report it at the end.
  ffmpeg.stdin.on('error', () => { broken = true; });
  const exited = new Promise(resolve => ffmpeg.on('exit', code => resolve(code)));

  const cdp = await page.context().newCDPSession(page);
  let latest = null, received = 0, written = 0, stopped = false;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    latest = Buffer.from(data, 'base64'); received++;
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: width, maxHeight: height, everyNthFrame: 1 });

  // Real-time pacing: as many frames as the clock says, each the newest one received.
  const started = Date.now();
  const tick = setInterval(() => {
    if (stopped || broken || !latest) return;
    const due = Math.floor((Date.now() - started) * fps / 1000);
    while (written < due) { ffmpeg.stdin.write(latest); written++; }
  }, Math.round(1000 / fps / 2));
  log(`recording → ${file} (${encoder})`);

  return {
    file,
    async stop() {
      stopped = true; clearInterval(tick);
      await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {});
      if (!broken) ffmpeg.stdin.end();
      const code = await exited;
      const stats = { file, seconds: Math.round((Date.now() - started) / 1000), frames: written, received, code, errors: errors.trim() };
      log(`recording saved: ${stats.seconds}s, ${written} frames written, ${received} drawn${code ? ` · ffmpeg exit ${code}: ${stats.errors}` : ''}`);
      return stats;
    },
  };
}
