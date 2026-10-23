# Переключение бота Si Phone на новый воркер si-phone-bot.
# Запуск (из папки bot):  powershell -ExecutionPolicy Bypass -File scripts\switch-bot.ps1 [-Admins 123,456]
# Ключи берутся из .dev.vars и сразу уходят в секреты Cloudflare — на экран не выводятся.
param([string]$Admins = '')

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# npm/wrangler пишут служебные строки в поток ошибок; старый PowerShell 5.1 при 'Stop'
# принимает их за ошибку и останавливается. Поэтому внешние команды — через cmd, вывод — строкой.
function Run-Native([string]$cmd) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = (cmd /c "$cmd 2>&1" | Out-String) } finally { $ErrorActionPreference = $prev }
  return @{ Out = $out; Code = $LASTEXITCODE }
}

function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }

# 1. Ключи из .dev.vars
Step "1/6 Читаю .dev.vars"
$vars = @{}
Get-Content .dev.vars | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $vars[$matches[1]] = $matches[2].Trim('"') }
}
foreach ($k in 'TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY') {
  if (-not $vars[$k]) { throw "В .dev.vars нет $k" }
}
Write-Host "ok: TELEGRAM_BOT_TOKEN и GEMINI_API_KEY найдены"
$token = $vars['TELEGRAM_BOT_TOKEN']

# 2. Админы
Step "2/6 chat_id админов"
$admins = $Admins.Trim()
if (-not $admins) { $admins = (Read-Host "Вставь chat_id админов через запятую, без пробелов").Trim() }
if ($admins -notmatch '^-?\d+(,-?\d+)*$') { throw "Формат: 123,456,789" }

# 3. Выкладка воркера
Step "3/6 Выкладываю воркер si-phone-bot"
$r = Run-Native 'npx wrangler deploy'
$out = $r.Out
if ($r.Code -ne 0) { Write-Host $out; throw "wrangler deploy не прошёл" }
$m = [regex]::Match($out, 'https://si-phone-bot\.[a-z0-9-]+\.workers\.dev')
if (-not $m.Success) { Write-Host $out; throw "Не нашёл адрес воркера в выводе" }
$url = $m.Value
Write-Host "ok: $url"

# 4. Секреты (новый случайный WEBHOOK_SECRET)
Step "4/6 Секреты в Cloudflare"
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$webhookSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$tmp = Join-Path $env:TEMP ("si-phone-bot-secrets-" + [guid]::NewGuid().ToString() + ".json")
try {
  @{
    TELEGRAM_BOT_TOKEN = $token
    GEMINI_API_KEY     = $vars['GEMINI_API_KEY']
    WEBHOOK_SECRET     = $webhookSecret
    ADMIN_CHAT_ID      = $admins
  } | ConvertTo-Json | Set-Content -Path $tmp -Encoding ASCII
  $r = Run-Native ('npx wrangler secret bulk "' + $tmp + '"')
  if ($r.Code -ne 0) { Write-Host ($r.Out -replace '[A-Za-z0-9_-]{30,}', '<скрыто>'); throw "wrangler secret bulk не прошёл" }
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}
Write-Host "ok: 4 секрета заданы"

# 5. Проверка воркера
Step "5/6 Проверяю воркер"
Start-Sleep -Seconds 3
$hello = Invoke-RestMethod -Uri $url -Method Get
Write-Host "GET: $hello"
$accepted = $false
try {
  Invoke-WebRequest -Uri $url -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing | Out-Null
  $accepted = $true
} catch {
  $code = $null
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -ne 401) { throw "Неожиданный ответ воркера на запрос без секрета: $code" }
  Write-Host "ok: запрос без секрета отклонён (401)"
}
if ($accepted) { throw "Воркер принял запрос без секрета — так быть не должно" }

# 6. Вебхук Telegram -> новый воркер
Step "6/6 Переключаю Telegram на новый воркер"
$r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $url; secret_token = $webhookSecret }
if (-not $r.ok) { throw "setWebhook: $($r.description)" }
$info = (Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo").result
Write-Host "ok: вебхук -> $($info.url)"
Write-Host "   ждут обработки: $($info.pending_update_count); последняя ошибка: $($info.last_error_message)"

Write-Host ""
Write-Host "Готово. Напиши боту /start и нажми «Открыть магазин»." -ForegroundColor Green
