# Bestiaire - etape A : liste de toutes les especes animales observees en France (GBIF) + infos Wikidata
# Lancer : powershell -ExecutionPolicy Bypass -File .\liste-especes.ps1   (environ 3 a 5 minutes)
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ua = 'BestiaireProto/0.1 (prototype personnel de jeu educatif)'
$headers = @{ 'User-Agent' = $ua }
function Get-Json($url) {
  for ($try = 1; $try -le 6; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 120 }
    catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 429 -or $code -ge 500 -or -not $code) { Write-Host "   serveur occupe, nouvel essai dans $($try*5) s"; Start-Sleep -Seconds ($try*5) }
      else { throw }
    }
  }
  throw 'abandon apres 6 essais'
}
# 1. GBIF : especes animales observees en France, par nombre d'observations
$all = @{}
for ($off = 0; $off -lt 20000; $off += 2000) {
  Write-Host "GBIF especes $off..."
  $r = Get-Json ("https://api.gbif.org/v1/occurrence/search?country=FR&kingdomKey=1&limit=0&facet=speciesKey&speciesKey.facetLimit=2000&speciesKey.facetOffset=$off")
  $counts = $r.facets[0].counts
  if (-not $counts -or $counts.Count -eq 0) { break }
  foreach ($c in $counts) { if ($c.count -ge 100) { $all[[string]$c.name] = $c.count } }
  if (($counts | Select-Object -Last 1).count -lt 100) { break }
  Start-Sleep -Milliseconds 800
}
Write-Host ("{0} especes avec au moins 100 observations" -f $all.Count)
# 2. Wikidata par lots de 200 : nom francais, nom scientifique, article Wikipedia FR, notoriete, statut UICN
$keys = @($all.Keys)
$wd = @()
for ($i = 0; $i -lt $keys.Count; $i += 200) {
  $batch = $keys[$i..([Math]::Min($i + 199, $keys.Count - 1))]
  $vals = ($batch | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $q = "SELECT ?gbif ?item ?sci ?label ?sl ?status ?frwiki WHERE { VALUES ?gbif { $vals } ?item wdt:P846 ?gbif . ?item wikibase:sitelinks ?sl . OPTIONAL { ?item wdt:P225 ?sci } OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = 'fr') } OPTIONAL { ?item wdt:P141 ?status } OPTIONAL { ?frwiki schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> } }"
  Write-Host ("Wikidata {0}/{1}" -f $i, $keys.Count)
  for ($try = 1; $try -le 4; $try++) {
    try {
      $r = Invoke-RestMethod -Method Post -Uri 'https://query.wikidata.org/sparql' -Body @{ query = $q } -Headers @{ 'User-Agent' = $ua; 'Accept' = 'application/sparql-results+json' } -TimeoutSec 120
      foreach ($b in $r.results.bindings) {
        $wd += [pscustomobject]@{ key = $b.gbif.value; qid = ($b.item.value -replace '.*/',''); sci = $b.sci.value; nom = $b.label.value; sl = [int]$b.sl.value; status = ($b.status.value -replace '.*/',''); frwiki = $b.frwiki.value }
      }
      break
    } catch { Write-Host "   Wikidata occupe, nouvel essai dans $($try*10) s"; Start-Sleep -Seconds ($try*10) }
  }
  Start-Sleep -Milliseconds 1500
}
$obs = @(); foreach ($k in $keys) { $obs += [pscustomobject]@{ key = $k; obsFR = $all[$k] } }
[pscustomobject]@{ gbif = $obs; wikidata = $wd; date = (Get-Date -Format s) } | ConvertTo-Json -Depth 5 -Compress | Out-File -Encoding utf8 (Join-Path $here 'liste-especes.json')
Write-Host ("Termine : {0} especes GBIF, {1} lignes Wikidata -> liste-especes.json" -f $obs.Count, $wd.Count)
