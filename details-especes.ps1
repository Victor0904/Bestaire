# Bestiaire - etape B : details + photo pour chaque espece selectionnee (environ 45 a 60 minutes)
# Reprend la ou il s'est arrete si on le relance. Lancer : powershell -ExecutionPolicy Bypass -File .\details-especes.ps1
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel de jeu educatif)' }
$photos = Join-Path $here 'photos-v2'
New-Item -ItemType Directory -Force -Path $photos | Out-Null
$outFile = Join-Path $here 'details.jsonl'
$done = @{}
if (Test-Path $outFile) { Get-Content $outFile -Encoding UTF8 | ForEach-Object { try { $o = $_ | ConvertFrom-Json; $done[[string]$o.id] = 1 } catch {} } }
function Get-Json($url) {
  for ($try = 1; $try -le 6; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 60 }
    catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 429 -or $code -ge 500 -or -not $code) { Write-Host "   serveur occupe, nouvel essai dans $($try*5) s"; Start-Sleep -Seconds ($try*5) }
      else { throw }
    }
  }
  throw 'abandon apres 6 essais'
}
function Get-Photo($sci, $file) {
  $r = Get-Json ("https://api.inaturalist.org/v1/taxa/autocomplete?q=" + [uri]::EscapeDataString($sci) + "&locale=fr&per_page=20")
  $t = $r.results | Where-Object { $_.name -eq $sci -and ($_.rank -eq 'species' -or $_.rank -eq 'hybrid') } | Select-Object -First 1
  if (-not $t) { $t = $r.results | Where-Object { $_.name -eq $sci } | Select-Object -First 1 }
  if (-not $t) { return $null }
  $photo = $null
  if ($t.default_photo -and $t.default_photo.license_code) { $photo = $t.default_photo }
  else {
    Start-Sleep -Milliseconds 1100
    $full = Get-Json ("https://api.inaturalist.org/v1/taxa/" + $t.id)
    $photo = ($full.results[0].taxon_photos | ForEach-Object { $_.photo } | Where-Object { $_.license_code } | Select-Object -First 1)
  }
  $res = @{ inatId = $t.id; inatNom = $t.preferred_common_name }
  if ($photo) {
    $url = $photo.medium_url
    $ext = [IO.Path]::GetExtension(([uri]$url).AbsolutePath).ToLower(); if (-not $ext) { $ext = '.jpg' }
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $photos ($file + $ext)) -Headers $headers -UseBasicParsing
    $res.photo = ($file + $ext); $res.licence = $photo.license_code; $res.credit = $photo.attribution; $res.source = ("https://www.inaturalist.org/photos/" + $photo.id)
  }
  return $res
}
# 1. Especes de France
$sel = Get-Content (Join-Path $here 'selection.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$i = 0
foreach ($s in $sel) {
  $i++
  if ($done.ContainsKey([string]$s.key)) { continue }
  Write-Host ("[{0}/{1}] {2}" -f $i, $sel.Count, $s.sci)
  try {
    $sp = Get-Json ("https://api.gbif.org/v1/species/" + $s.key)
    Start-Sleep -Milliseconds 300
    $o = Get-Json ("https://api.gbif.org/v1/occurrence/search?taxonKey=" + $s.key + "&country=FR&limit=0&facet=month&month.facetLimit=12&facet=gadmLevel2Gid&gadmLevel2Gid.facetLimit=200")
    $months = @{}; $deps = 0
    foreach ($f in $o.facets) {
      if ($f.field -eq 'MONTH') { foreach ($c in $f.counts) { $months[[string]$c.name] = $c.count } }
      else { $deps = @($f.counts | Where-Object { $_.count -ge 3 }).Count }
    }
    $ph = $null
    try { $ph = Get-Photo $s.sci ([string]$s.key) } catch { Write-Host ('   photo : ' + $_.Exception.Message) }
    $rec = [pscustomobject]@{ id = [string]$s.key; sci = $s.sci; nom = $s.nom; classe = $sp.class; ordre = $sp.order; famille = $sp.family; obsFR = $o.count; departements = $deps; mois = $months; sl = $s.sl; status = $s.status; photo = $ph }
    ($rec | ConvertTo-Json -Depth 5 -Compress) | Out-File -Append -Encoding utf8 $outFile
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message) }
  Start-Sleep -Milliseconds 900
}
# 2. Especes etrangeres (pour le marche)
$etr = Get-Content (Join-Path $here 'etrangers.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($s in $etr) {
  $id = 'x-' + (($s.sci.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))
  if ($done.ContainsKey($id)) { continue }
  Write-Host ("[etranger] {0} ({1})" -f $s.sci, $s.pays)
  try {
    $m = Get-Json ("https://api.gbif.org/v1/species/match?name=" + [uri]::EscapeDataString($s.sci))
    $ph = Get-Photo $s.sci $id
    $rec = [pscustomobject]@{ id = $id; sci = $s.sci; pays = $s.pays; classe = $m.class; ordre = $m.order; famille = $m.family; photo = $ph }
    ($rec | ConvertTo-Json -Depth 5 -Compress) | Out-File -Append -Encoding utf8 $outFile
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message) }
  Start-Sleep -Milliseconds 1100
}
Write-Host 'Termine ! Fichier details.jsonl et dossier photos-v2'
