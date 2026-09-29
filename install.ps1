# cosmos-kit для ИИ-агентов (Windows, PowerShell):
#   irm https://raw.githubusercontent.com/Ihor-Zakharov/cosmos-kit/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$Dest = if ($env:COSMOS_KIT) { $env:COSMOS_KIT } else { Join-Path $HOME ".cosmos-kit" }
if (Test-Path (Join-Path $Dest ".git")) { git -C $Dest pull --ff-only -q }
elseif (Get-Command git -ErrorAction SilentlyContinue) { git -c core.symlinks=true clone -q --depth 1 https://github.com/Ihor-Zakharov/cosmos-kit $Dest }
else {
  $tgz = Join-Path ([IO.Path]::GetTempPath()) "cosmos-kit.tar.gz"
  Invoke-WebRequest "https://codeload.github.com/Ihor-Zakharov/cosmos-kit/tar.gz/main" -OutFile $tgz
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null; tar -xzf $tgz -C $Dest --strip-components=1
}
$py = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
& $py (Join-Path $Dest "src/tools/cosmos.py") global-install
& $py (Join-Path $Dest "src/tools/cosmos.py") setup
Write-Host "cosmos-kit -> $Dest. Дальше в проекте: «примени UI» / «сделай с UI» — или $py $Dest/src/tools/cosmos.py init"
