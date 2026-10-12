import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';
import { decryptApiKey } from '../../../lib/crypto';
import {
  chooseModel, absolutize,
  FLASH_MODEL, FULL_MODEL, IMAGE_MODEL,
  VIDEO_SIZES, VIDEO_ASPECTS, VIDEO_MODES, IMAGE_SIZES, IMAGE_RATIOS
} from '../../../lib/utils';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const rows = await env.DB.prepare(`
    SELECT id,video_id,model,mode,status,poll_count,created_at,finished_at,r2_key,video_deleted_at
    FROM tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 50
  `).bind(user.id).all();
  return json({ tasks: rows.results || [] });
};

async function pickIdleKey(env: any, userId: number) {
  return await env.DB.prepare(`
    SELECT id,key_enc FROM api_keys
    WHERE user_id=? AND deleted_at IS NULL AND status='active' AND in_use=0
    ORDER BY last_used_at ASC LIMIT 1
  `).bind(userId).first();
}

function agnesError(res: Response, data: any, raw: string, fallback: string) {
  const status = res.status || 502;
  let detail = '';
  try {
    if (typeof data === 'string') detail = data;
    else if (data) {
      const d = data.detail ?? data.error?.message ?? data.error ?? data.message ?? data.msg ?? data.reason;
      detail = typeof d === 'string' ? d : d !== undefined && d !== null ? JSON.stringify(d).slice(0, 400) : '';
    }
  } catch { /* ignore */ }
  if (!detail) detail = (raw || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400);
  if (!detail) detail = `${fallback}：Agnes 返回 HTTP ${status} 且无错误详情`;
  const hint = status === 401 || status === 403
    ? `（认证被拒绝，请到「密钥池」核对 Key 是否复制完整、是否为 Agnes APIHUB 的 Key）`
    : status === 429
      ? '（API 限流中，约 5~12 分钟后自动恢复，请稍后再试）'
      : '';
  return json({ error: `${detail}${hint}`, agnesStatus: status }, status);
}

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const origin = new URL(request.url).origin;
  const body = await request.json().catch(() => ({}));
  const isImage = body.type === 'image' || body.model === IMAGE_MODEL;

  const prompt = String(body.prompt || '').trim();
  if (!prompt) return json({ error: '提示词不能为空' }, 400);
  if (!env.ENC_KEY) return json({ error: '未配置 ENC_KEY' }, 500);

  if (isImage) {
    return await createImageTask(request, env, user, prompt, body, origin);
  }
  return await createVideoTask(request, env, user, prompt, body, origin);
};

/** 文生图：任务入队（status='pending'），由 /api/cron/poll 每轮逐张异步生成（规避限流 429 与长耗时同步接口） */
async function createImageTask(request: Request, env: any, user: any, prompt: string, body: any, origin: string) {
  const size = IMAGE_SIZES.includes(String(body.image_size || body.size || '').toUpperCase())
    ? String(body.image_size || body.size).toUpperCase() : '1K';
  const ratioRaw = String(body.ratio || body.aspect_ratio || '');
  const ratio = IMAGE_RATIOS.includes(ratioRaw) ? ratioRaw : undefined;

  const params = { type: 'image', prompt, image_size: size, ratio: ratio || '1:1', nra: 0 };
  const ins = await env.DB.prepare(`
    INSERT INTO tasks(user_id,video_id,model,mode,status,params_json,poll_count,created_at)
    VALUES(?,?,?,'image','pending',?,0,datetime('now'))
  `).bind(user.id, 'img_' + Date.now(), IMAGE_MODEL, JSON.stringify(params)).run();

  return json({ ok: true, taskId: ins.meta.last_row_id, model: IMAGE_MODEL, image: true, queued: true });
}

/** 视频任务：text / keyframe / reference 三种模式校验后转发 */
async function createVideoTask(request: Request, env: any, user: any, prompt: string, body: any, origin: string) {
  const mode = VIDEO_MODES.includes(body.mode) ? body.mode : 'text';

  const params: any = { mode, prompt };

  // 时长 4-12 秒
  if (body.seconds !== undefined && body.seconds !== null && body.seconds !== '') {
    const s = Number(body.seconds);
    if (!Number.isInteger(s) || s < 4 || s > 12) return json({ error: '时长需为 4~12 秒的整数' }, 400);
    params.seconds = String(s);
  }
  // 尺寸
  if (body.size) {
    const size = String(body.size).toUpperCase();
    if (!VIDEO_SIZES.includes(size)) return json({ error: '尺寸仅支持 720P / 1080P / 1K / 2K' }, 400);
    params.size = size;
  }
  // 画幅
  if (body.aspect_ratio) {
    const ar = String(body.aspect_ratio);
    if (!VIDEO_ASPECTS.includes(ar)) return json({ error: '画幅仅支持 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16' }, 400);
    params.aspect_ratio = ar;
  }
  // 随机种子 / 数量透传
  if (body.seed !== undefined && body.seed !== null && body.seed !== '') {
    const seed = Number(body.seed);
    if (!Number.isInteger(seed)) return json({ error: 'seed 需为整数' }, 400);
    params.seed = seed;
  }
  if (body.n !== undefined) params.n = 1;

  // 模式专用媒体字段
  const first = absolutize(body.first_frame, origin);
  const last = absolutize(body.last_frame, origin);
  const images = (Array.isArray(body.images) ? body.images : []).map((u: any) => absolutize(u, origin)).filter(Boolean);
  const audios = (Array.isArray(body.audios) ? body.audios : []).map((u: any) => absolutize(u, origin)).filter(Boolean);

  if (mode === 'keyframe') {
    if (!first && !last) return json({ error: '首尾帧模式至少需要上传首帧或尾帧图片' }, 400);
    if (first) params.first_frame = first;
    if (last) params.last_frame = last;
  } else if (mode === 'reference') {
    if (!images.length && !audios.length) return json({ error: '参考图模式至少需要一张参考图片' }, 400);
    if (images.length) params.images = images;
    if (audios.length) params.audios = audios;
  }

  const model = chooseModel(params);

  const key = await pickIdleKey(env, user.id);
  if (!key) return json({ error: '当前没有可用的空闲 API Key' }, 400);
  const plain = (await decryptApiKey(key.key_enc, env.ENC_KEY)).replace(/\s+/g, '');
  await env.DB.prepare('UPDATE api_keys SET in_use=1, last_used_at=datetime("now"), updated_at=datetime("now") WHERE id=? AND user_id=?').bind(key.id, user.id).run();

  let created = false;
  try {
    const agRes = await fetch('https://apihub.agnes-ai.com/v1/videos', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${plain}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, model })
    });
    const agText = await agRes.text().catch(() => '');
    let agData: any = {};
    try { agData = agText ? JSON.parse(agText) : {}; } catch { /* 保留原文 */ }
    if (!agRes.ok) return agnesError(agRes, agData, agText, 'Agnes 创建任务失败');

    const videoId = agData.video_id || agData.id || agData.task_id;
    if (!videoId) return json({ error: 'Agnes 返回缺少 video_id' }, 502);

    const ins = await env.DB.prepare(`
      INSERT INTO tasks(user_id,video_id,model,mode,status,params_json,key_id,poll_count,created_at)
      VALUES(?,?,?,?,'pending',?,?,0,datetime('now'))
    `).bind(user.id, videoId, model, mode, JSON.stringify(params), key.id).run();
    created = true;
    return json({ ok: true, taskId: ins.meta.last_row_id, videoId, model });
  } catch (e: any) {
    return json({ error: '调用 Agnes 失败：' + (e?.message || String(e)) }, 502);
  } finally {
    // 创建失败时释放占用；成功时保持 in_use=1，由 poll 认领该任务（key_id 已记录）后轮询并释放
    if (!created) {
      try {
        await env.DB.prepare('UPDATE api_keys SET in_use=0, updated_at=datetime("now") WHERE id=? AND user_id=? AND in_use=1').bind(key.id, user.id).run();
      } catch { /* ignore */ }
    }
  }
}
