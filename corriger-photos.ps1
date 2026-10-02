# Bestiaire - corrige les photos du lynx boreal et du grand-duc d'Europe
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'photos'
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel)' }
$fix = @()
foreach ($sci in @('Lynx lynx','Bubo bubo')) {
  $slug = (($sci.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))
  $q = [uri]::EscapeDataString($sci)
  $r = Invoke-RestMethod -Uri "https://api.inaturalist.org/v1/taxa?q=$q&rank=species&locale=fr&per_page=10" -Headers $headers
  $t = $r.results | Where-Object { $_.name -eq $sci } | Select-Object -First 1
  if (-not $t) { Write-Host "$sci introuvable"; continue }
  Start-Sleep -Milliseconds 1100
  $full = Invoke-RestMethod -Uri ("https://api.inaturalist.org/v1/taxa/" + $t.id) -Headers $headers
  $photo = ($full.results[0].taxon_photos | ForEach-Object { $_.photo } | Where-Object { $_.license_code } | Select-Object -First 1)
  if (-not $photo) { Write-Host "$sci : pas de photo libre"; continue }
  $url = $photo.medium_url
  $ext = [IO.Path]::GetExtension(([uri]$url).AbsolutePath).ToLower(); if (-not $ext) { $ext = '.jpg' }
  Get-ChildItem $out -Filter "$slug.*" | Remove-Item -ErrorAction SilentlyContinue
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $out ($slug + $ext)) -Headers $headers -UseBasicParsing
  $fix += [pscustomobject]@{ id = $slug; sci = $sci; inat = $t.name; nomFr = $t.preferred_common_name; file = ($slug + $ext); licence = $photo.license_code; credit = $photo.attribution; source = ("https://www.inaturalist.org/photos/" + $photo.id) }
  Write-Host "$sci corrige : $($t.name) / $($t.preferred_common_name)"
  Start-Sleep -Milliseconds 1100
}
$fix | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $out 'corrections.json')
Write-Host 'Termine'
