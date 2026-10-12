export const FLASH_MODEL = 'agnes-video-2.5-flash';
export const FULL_MODEL = 'agnes-video-2.5';
export const IMAGE_MODEL = 'agnes-image-2.5-flash';

export const VIDEO_SIZES = ['720P', '1080P', '1K', '2K'];
export const VIDEO_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
export const IMAGE_SIZES = ['1K', '2K', '3K', '4K'];
export const IMAGE_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'];
export const VIDEO_MODES = ['text', 'keyframe', 'reference'];

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
}

/** 依据 Flash 限制自动选择视频模型：超出限制则回退到 agnes-video-2.5 完整版 */
export function chooseModel(body: any) {
  try {
    const size = body?.size;
    const images = [...strList(body?.images), ...strList(body?.reference?.images)];
    const audios = [...strList(body?.audios), ...strList(body?.reference?.audios)];
    const videos = [...strList(body?.videos), ...strList(body?.reference?.videos)];

    if (videos.length > 0) return FULL_MODEL;
    if (images.length > 5) return FULL_MODEL;
    if (audios.length > 3) return FULL_MODEL;
    if (size && String(size).toUpperCase() !== '720P') return FULL_MODEL;
    return FLASH_MODEL;
  } catch (e) {
    return FLASH_MODEL;
  }
}

/** 相对路径（/api/media/...）转为绝对地址，供 Agnes 服务端抓取 */
export function absolutize(url: unknown, origin: string): string {
  if (typeof url !== 'string' || !url) return '';
  if (url.startsWith('/')) return origin + url;
  return url;
}

export function b64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): string {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return atob(t);
}
