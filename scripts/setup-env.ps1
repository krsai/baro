param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$targets = @(
  @{
    Example = Join-Path $root "frontend/.env.example"
    Output  = Join-Path $root "frontend/.env"
  },
  @{
    Example = Join-Path $root "backend/.env.example"
    Output  = Join-Path $root "backend/.env"
  }
)

foreach ($target in $targets) {
  $examplePath = $target.Example
  $outputPath = $target.Output

  if (!(Test-Path $examplePath)) {
    Write-Warning "Example file is missing: $examplePath"
    continue
  }

  if ((Test-Path $outputPath) -and -not $Force) {
    Write-Host "Skip (already exists): $outputPath"
    continue
  }

  Copy-Item $examplePath $outputPath -Force
  Write-Host "Created: $outputPath"
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1) Fill real values in frontend/.env (Supabase URL, anon key)."
Write-Host "2) Fill real values in backend/.env (DATABASE_URL)."
