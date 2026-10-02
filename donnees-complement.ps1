# Bestiaire - complement : especes bloquees par GBIF (429) + photos du lynx et du grand-duc
# Lancer : powershell -ExecutionPolicy Bypass -File .\donnees-complement.ps1
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel de jeu educatif)' }
function Get-Json($url) {
  for ($try = 1; $try -le 5; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $headers }
    catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 429 -or $code -ge 500) { Write-Host "   serveur occupe, nouvel essai dans $($try*5) s"; Start-Sleep -Seconds ($try*5) }
      else { throw }
    }
  }
  throw 'abandon apres 5 essais'
}
$species = @(
  'Lynx lynx',
  'Erithacus rubecula',
  'Fringilla coelebs',
  'Larus argentatus',
  'Cygnus olor',
  'Strix aluco',
  'Fratercula arctica',
  'Testudo hermanni',
  'Hyla arborea',
  'Esox lucius',
  'Libellula depressa',
  'Lucanus cervus',
  'Lyristes plebejus',
  'Eratigena atrica',
  'Buthus occitanus',
  'Helix pomatia',
  'Octopus vulgaris',
  'Periparus ater',
  'Asio otus',
  'Carcinus maenas'
)
$gbif = @()
foreach ($sci in $species) {
  Write-Host ("[GBIF] " + $sci)
  try {
    $m = Get-Json ("https://api.gbif.org/v1/species/match?name=" + [uri]::EscapeDataString($sci))
    $key = $m.usageKey; if ($m.acceptedUsageKey) { $key = $m.acceptedUsageKey }
    Start-Sleep -Milliseconds 800
    $o = Get-Json ("https://api.gbif.org/v1/occurrence/search?taxonKey=$key&country=FR&limit=0&facet=month&month.facetLimit=12")
    $months = @{}
    foreach ($f in $o.facets) { foreach ($c in $f.counts) { $months[[string]$c.name] = $c.count } }
    $gbif += [pscustomobject]@{ sci = $sci; key = $key; matchType = $m.matchType; rank = $m.rank; gbifName = $m.scientificName; obsFR = $o.count; mois = $months }
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message) }
  Start-Sleep -Milliseconds 800
}
$out = Join-Path $here 'photos'
$fix = @()
foreach ($sci in @('Lynx lynx','Bubo bubo')) {
  try {
    $slug = (($sci.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))
    $r = Get-Json ("https://api.inaturalist.org/v1/taxa/autocomplete?q=" + [uri]::EscapeDataString($sci) + "&locale=fr&per_page=20")
    $t = $r.results | Where-Object { $_.name -eq $sci -and $_.rank -eq 'species' } | Select-Object -First 1
    if (-not $t) { Write-Host ("   {0} introuvable, resultats : {1}" -f $sci, (($r.results | ForEach-Object { $_.name + ' (' + $_.rank + ')' }) -join ', ')); continue }
    Start-Sleep -Milliseconds 1100
    $full = Get-Json ("https://api.inaturalist.org/v1/taxa/" + $t.id)
    $photo = ($full.results[0].taxon_photos | ForEach-Object { $_.photo } | Where-Object { $_.license_code } | Select-Object -First 1)
    if (-not $photo) { Write-Host "   $sci : pas de photo libre"; continue }
    $url = $photo.medium_url
    $ext = [IO.Path]::GetExtension(([uri]$url).AbsolutePath).ToLower(); if (-not $ext) { $ext = '.jpg' }
    $file = 'fix-' + $slug + $ext
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $out $file) -Headers $headers -UseBasicParsing
    $fix += [pscustomobject]@{ id = $slug; sci = $sci; inat = $t.name; nomFr = $t.preferred_common_name; file = $file; licence = $photo.license_code; credit = $photo.attribution; source = ("https://www.inaturalist.org/photos/" + $photo.id) }
    Write-Host ("Photo corrigee : {0} ({1})" -f $t.name, $t.preferred_common_name)
    Start-Sleep -Milliseconds 1100
  } catch { Write-Host ('   erreur photo ' + $sci + ' : ' + $_.Exception.Message) }
}
[pscustomobject]@{ gbif = $gbif; photos = $fix } | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 (Join-Path $here 'donnees-complement.json')
Write-Host ("Termine : {0}/{1} especes, {2} photos" -f $gbif.Count, $species.Count, $fix.Count)
