import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { verifyAdminToken, unauthorized } from '../_shared/adminAuth.ts';

// Выдаёт админу одноразовую ссылку на загрузку ОДНОГО фото в бакет products.
// Путь собирает сервер, а не браузер: в хранилище нельзя положить файл куда угодно
// и под любым расширением. Писать в бакет напрямую публичным ключом больше нельзя.

const FOLDERS = new Set(['iphone', 'ipad', 'macbook', 'watch', 'airpods', 'airpods_max']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9_]{1,60}$/;
const EXT_RE = /\.(jpe?g|png|webp|avif)$/i;

interface RequestBody {
  folder: string;
  entityId: string;
  colorSlug?: string;
  fileName: string;
}

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await verifyAdminToken(req))) return unauthorized();

  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { folder, entityId, colorSlug, fileName } = (await req.json()) as RequestBody;

    if (!FOLDERS.has(folder)) return json({ error: 'Bad folder' }, 400);
    if (!UUID_RE.test(entityId ?? '')) return json({ error: 'Bad entityId' }, 400);
    if (colorSlug && !SLUG_RE.test(colorSlug)) return json({ error: 'Bad colorSlug' }, 400);

    const safeName = String(fileName ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    if (!EXT_RE.test(safeName)) return json({ error: 'Только фото: jpg, png, webp, avif' }, 400);

    const path = [folder, entityId, colorSlug, `${Date.now()}-${safeName}`]
      .filter(Boolean)
      .join('/');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const bucket = supabase.storage.from('products');
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? 'createSignedUploadUrl failed');

    const { data: { publicUrl } } = bucket.getPublicUrl(path);
    return json({ path: data.path, token: data.token, publicUrl });
  } catch (err) {
    console.error('media-sign-upload error:', err);
    return json({ error: 'Не удалось подготовить загрузку' }, 500);
  }
}));
