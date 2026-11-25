// 녹화 파일 다루기: 길이 고치기, 장면 이동, 썸네일, 파일 저장

/** MediaRecorder 로 만든 webm 은 길이가 Infinity 로 나와서, 끝까지 한 번 넘겨 실제 길이를 알아내요. */
export function fixDuration(video: HTMLMediaElement) {
  return new Promise<void>((resolve) => {
    const go = () => {
      if (video.duration === Infinity || isNaN(video.duration)) {
        const h = () => { video.removeEventListener('timeupdate', h); video.currentTime = 0; resolve(); };
        video.addEventListener('timeupdate', h);
        video.currentTime = 1e101;
        setTimeout(resolve, 2500);
      } else resolve();
    };
    if (video.readyState >= 1) go();
    else video.addEventListener('loadedmetadata', go, { once: true });
  });
}

export const seekTo = (v: HTMLMediaElement, t: number) => new Promise<void>((r) => {
  const to = setTimeout(r, 1500);
  v.addEventListener('seeked', () => { clearTimeout(to); r(); }, { once: true });
  v.currentTime = Math.max(0.05, t);
});

export async function makeThumbs(url: string, times: number[]) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await fixDuration(v);
  const c = document.createElement('canvas');
  const out: string[] = [];
  for (const t of times) {
    await seekTo(v, t);
    c.width = 320;
    c.height = Math.round((320 * (v.videoHeight || 9)) / (v.videoWidth || 16));
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.72));
  }
  v.removeAttribute('src'); v.load();
  return out;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export const pickMime = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? '';

/** 음성만 녹음할 때 쓸 형식 */
export const pickAudioMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? '';
