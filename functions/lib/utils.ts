export function chooseModel(body: any) {
  const modelFlash = 'agnes-video-2.5-flash';
  const modelFull = 'agnes-video-2.5';

  try {
    const size = body?.size;
    const ref = body?.reference || {};
    const images = Array.isArray(ref.images) ? ref.images : [];
    const audios = Array.isArray(ref.audios) ? ref.audios : [];
    const videos = Array.isArray(ref.videos) ? ref.videos : [];

    if (videos.length > 0) return modelFull;
    if (images.length > 5) return modelFull;
    if (audios.length > 3) return modelFull;
    if (size && String(size).toUpperCase() !== '720P') return modelFull;

    return modelFlash;
  } catch (e) {
    return modelFlash;
  }
}
