# Профиль бота Si Phone: меню команд и описание (то, что видно до «Старт» и в профиле бота).
# Запуск (из папки bot):  powershell -ExecutionPolicy Bypass -File scripts\setup-profile.ps1
# Токен берётся из .dev.vars и на экран не выводится. Тексты описания — в src/config.ts (BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION).

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$token = ((Get-Content .dev.vars | Where-Object { $_ -match '^TELEGRAM_BOT_TOKEN=' }) -replace '^TELEGRAM_BOT_TOKEN=', '').Trim().Trim('"')
if (-not $token) { throw "В .dev.vars нет TELEGRAM_BOT_TOKEN" }

function Call($method, $body) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/$method" -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8'
  if (-not $r.ok) { throw "$method не прошёл" }
  Write-Host "ok: $method"
}

# Тексты описания — из config.ts (одна строка в кавычках после знака =)
$config = Get-Content src\config.ts -Raw -Encoding UTF8
function FromConfig($name) {
  $m = [regex]::Match($config, "export const $name =\s*`"((?:[^`"\\]|\\.)*)`"")
  if (-not $m.Success) { throw "Не нашёл $name в config.ts" }
  return $m.Groups[1].Value.Replace('\n', "`n").Replace('\"', '"')
}

# Меню команд для всех
Call 'setMyCommands' @{ commands = @(
  @{ command = 'start';   description = 'Главное меню' },
  @{ command = 'faq';     description = 'Частые вопросы' },
  @{ command = 'manager'; description = 'Написать менеджеру' },
  @{ command = 'reviews'; description = 'Отзывы покупателей' }
) }

Call 'setMyDescription' @{ description = (FromConfig 'BOT_DESCRIPTION') }
Call 'setMyShortDescription' @{ short_description = (FromConfig 'BOT_SHORT_DESCRIPTION') }
