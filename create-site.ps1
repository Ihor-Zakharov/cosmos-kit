# Новый сайт на cosmos-kit (Windows, PowerShell):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/create-site.ps1))) my-site
param([string]$Dir = "my-site", [string]$Ref = "main")
$ErrorActionPreference = "Stop"
if ((Test-Path $Dir) -and (Get-ChildItem $Dir -Force | Select-Object -First 1)) { throw "Каталог $Dir не пуст — выбери другое имя." }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cosmos-kit-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $tgz = Join-Path $tmp "kit.tar.gz"
  Invoke-WebRequest "https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/$Ref" -OutFile $tgz
  tar -xzf $tgz -C $tmp
  $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path "$Dir/kit", "$Dir/.agents/skills", "$Dir/.claude" | Out-Null
  Copy-Item "$($src.FullName)/starter/*" $Dir -Recurse -Force
  Copy-Item "$($src.FullName)/src/*" "$Dir/kit" -Recurse -Force
  Copy-Item "$($src.FullName)/VERSION", "$($src.FullName)/CHANGELOG.md" "$Dir/kit"
  Copy-Item "$($src.FullName)/.agents/skills/cosmos-site" "$Dir/.agents/skills" -Recurse
  Copy-Item "$Dir/AGENTS.md" "$Dir/CLAUDE.md"
  Copy-Item "$Dir/.agents/skills" "$Dir/.claude" -Recurse
  "node_modules/`n.env*`n.DS_Store" | Set-Content "$Dir/.gitignore"
  Write-Host "Готово: $Dir (cosmos-kit $(Get-Content "$Dir/kit/VERSION"), $Ref). Дальше: прочитай $Dir/AGENTS.md"
} finally { Remove-Item $tmp -Recurse -Force }
