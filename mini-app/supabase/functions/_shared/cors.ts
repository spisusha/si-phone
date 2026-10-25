// CORS — только для браузеров и НЕ является защитой (curl шлёт что угодно).
// Настоящая защита — проверки внутри функций (токен админа, initData Telegram).
// Разрешённые адреса задаются секретом ALLOWED_ORIGINS через запятую.
const DEFAULT_ORIGINS = 'https://si-phone.pages.dev,http://localhost:5173';

function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

// Оборачивает обработчик: проставляет Access-Control-Allow-Origin только для своих адресов.
export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const origin = req.headers.get('Origin');
    const headers = new Headers(res.headers);
    headers.delete('Access-Control-Allow-Origin');
    if (origin && allowedOrigins().includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
