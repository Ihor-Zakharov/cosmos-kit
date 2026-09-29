# Новый сайт на cosmos-kit (Windows, PowerShell) — то же, что install.ps1 + cosmos.py init:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.ps1))) my-site
param([string]$Dir = "my-site", [switch]$App)
$ErrorActionPreference = "Stop"
if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) { throw "Каталог $Dir не пуст — выбери другое имя." }
irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.ps1 | iex
$Dest = if ($env:COSMOS_KIT) { $env:COSMOS_KIT } else { Join-Path $HOME ".cosmos-kit" }
$py = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
$extra = @("--new"); if ($App) { $extra += "--app" }
& $py (Join-Path $Dest "src/tools/cosmos.py") init $Dir @extra
Write-Host "Дальше: cd $Dir; $py -m http.server 8000 -> http://localhost:8000/ ; правила — .agents/skills/cosmos-site/SKILL.md"
