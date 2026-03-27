$ErrorActionPreference = "Stop"
$repo = "github:ansund/skriver"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Skriver needs Node.js 18+ first. Install Node, then run this installer again."
}

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Write-Host "Installing skriver with pnpm..."
  pnpm add -g $repo
}
elseif (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host "Installing skriver with npm..."
  npm install -g $repo
}
else {
  Write-Error "Skriver needs npm or pnpm available on your PATH."
}

Write-Host ""
Write-Host "Skriver is installed."
Write-Host "Next:"
Write-Host "  skriver doctor"
Write-Host "  skriver transcribe --help"
