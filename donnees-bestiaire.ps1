# Bestiaire - donnees reelles : observations GBIF en France, statut UICN et notoriete Wikidata, + correction de 2 photos
# Lancer : powershell -ExecutionPolicy Bypass -File .\donnees-bestiaire.ps1
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel de jeu educatif)' }
$species = @(
  'Sciurus vulgaris',
  'Erinaceus europaeus',
  'Vulpes vulpes',
  'Capreolus capreolus',
  'Sus scrofa',
  'Cervus elaphus',
  'Meles meles',
  'Lepus europaeus',
  'Oryctolagus cuniculus',
  'Pipistrellus pipistrellus',
  'Martes foina',
  'Talpa europaea',
  'Apodemus sylvaticus',
  'Lutra lutra',
  'Castor fiber',
  'Marmota marmota',
  'Rupicapra rupicapra',
  'Capra ibex',
  'Canis lupus',
  'Felis silvestris',
  'Genetta genetta',
  'Rhinolophus ferrumequinum',
  'Phoca vitulina',
  'Tursiops truncatus',
  'Lynx lynx',
  'Ursus arctos',
  'Parus major',
  'Cyanistes caeruleus',
  'Turdus merula',
  'Erithacus rubecula',
  'Passer domesticus',
  'Columba palumbus',
  'Streptopelia decaocto',
  'Pica pica',
  'Corvus corone',
  'Sturnus vulgaris',
  'Fringilla coelebs',
  'Phoenicurus ochruros',
  'Sylvia atricapilla',
  'Hirundo rustica',
  'Apus apus',
  'Larus argentatus',
  'Chroicocephalus ridibundus',
  'Anas platyrhynchos',
  'Phalacrocorax carbo',
  'Ardea cinerea',
  'Cygnus olor',
  'Buteo buteo',
  'Falco tinnunculus',
  'Strix aluco',
  'Dendrocopos major',
  'Picus viridis',
  'Garrulus glandarius',
  'Cuculus canorus',
  'Haematopus ostralegus',
  'Pyrrhocorax graculus',
  'Tyto alba',
  'Alcedo atthis',
  'Ciconia ciconia',
  'Upupa epops',
  'Merops apiaster',
  'Grus grus',
  'Phoenicopterus roseus',
  'Morus bassanus',
  'Caprimulgus europaeus',
  'Bubo bubo',
  'Aquila chrysaetos',
  'Tichodroma muraria',
  'Fratercula arctica',
  'Gypaetus barbatus',
  'Podarcis muralis',
  'Lacerta bilineata',
  'Anguis fragilis',
  'Natrix helvetica',
  'Hierophis viridiflavus',
  'Vipera aspis',
  'Emys orbicularis',
  'Testudo hermanni',
  'Bufo bufo',
  'Pelophylax kl. esculentus',
  'Rana temporaria',
  'Salamandra salamandra',
  'Hyla arborea',
  'Epidalea calamita',
  'Triturus cristatus',
  'Cyprinus carpio',
  'Perca fluviatilis',
  'Esox lucius',
  'Salmo trutta',
  'Silurus glanis',
  'Salmo salar',
  'Hippocampus guttulatus',
  'Apis mellifera',
  'Bombus terrestris',
  'Coccinella septempunctata',
  'Aglais io',
  'Vanessa atalanta',
  'Pyrrhocoris apterus',
  'Papilio machaon',
  'Macroglossum stellatarum',
  'Vespa crabro',
  'Tettigonia viridissima',
  'Libellula depressa',
  'Calopteryx splendens',
  'Cetonia aurata',
  'Lucanus cervus',
  'Mantis religiosa',
  'Lampyris noctiluca',
  'Lyristes plebejus',
  'Saturnia pyri',
  'Rosalia alpina',
  'Parnassius apollo',
  'Araneus diadematus',
  'Eratigena atrica',
  'Argiope bruennichi',
  'Misumena vatia',
  'Buthus occitanus',
  'Cornu aspersum',
  'Lumbricus terrestris',
  'Helix pomatia',
  'Asterias rubens',
  'Rhizostoma pulmo',
  'Octopus vulgaris',
  'Homarus gammarus',
  'Myocastor coypus',
  'Periparus ater',
  'Corvus corax',
  'Prunella collaris',
  'Asio otus',
  'Culex pipiens',
  'Gerris lacustris',
  'Carcinus maenas',
  'Crangon crangon',
  'Littorina littorea',
  'Austropotamobius pallipes'
)
# 1. GBIF : observations en France + repartition par mois
$gbif = @()
$i = 0
foreach ($sci in $species) {
  $i++
  Write-Host ("[GBIF {0}/{1}] {2}" -f $i, $species.Count, $sci)
  try {
    $name = $sci -replace ' kl\. ',' '
    $m = Invoke-RestMethod -Uri ("https://api.gbif.org/v1/species/match?name=" + [uri]::EscapeDataString($name)) -Headers $headers
    $key = $m.usageKey
    if ($m.acceptedUsageKey) { $key = $m.acceptedUsageKey }
    $o = Invoke-RestMethod -Uri ("https://api.gbif.org/v1/occurrence/search?taxonKey=$key&country=FR&limit=0&facet=month&month.facetLimit=12") -Headers $headers
    $months = @{}
    foreach ($f in $o.facets) { foreach ($c in $f.counts) { $months[[string]$c.name] = $c.count } }
    $gbif += [pscustomobject]@{ sci = $sci; key = $key; matchType = $m.matchType; rank = $m.rank; gbifName = $m.scientificName; obsFR = $o.count; mois = $months }
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message); $gbif += [pscustomobject]@{ sci = $sci; erreur = $_.Exception.Message } }
  Start-Sleep -Milliseconds 150
}
# 2. Wikidata : statut UICN + nombre d'articles Wikipedia (toutes langues)
Write-Host 'Wikidata...'
$sparql = @"
SELECT ?name ?item ?sitelinks ?status WHERE {
  VALUES ?name { "Sciurus vulgaris" "Erinaceus europaeus" "Vulpes vulpes" "Capreolus capreolus" "Sus scrofa" "Cervus elaphus" "Meles meles" "Lepus europaeus" "Oryctolagus cuniculus" "Pipistrellus pipistrellus" "Martes foina" "Talpa europaea" "Apodemus sylvaticus" "Lutra lutra" "Castor fiber" "Marmota marmota" "Rupicapra rupicapra" "Capra ibex" "Canis lupus" "Felis silvestris" "Genetta genetta" "Rhinolophus ferrumequinum" "Phoca vitulina" "Tursiops truncatus" "Lynx lynx" "Ursus arctos" "Parus major" "Cyanistes caeruleus" "Turdus merula" "Erithacus rubecula" "Passer domesticus" "Columba palumbus" "Streptopelia decaocto" "Pica pica" "Corvus corone" "Sturnus vulgaris" "Fringilla coelebs" "Phoenicurus ochruros" "Sylvia atricapilla" "Hirundo rustica" "Apus apus" "Larus argentatus" "Chroicocephalus ridibundus" "Anas platyrhynchos" "Phalacrocorax carbo" "Ardea cinerea" "Cygnus olor" "Buteo buteo" "Falco tinnunculus" "Strix aluco" "Dendrocopos major" "Picus viridis" "Garrulus glandarius" "Cuculus canorus" "Haematopus ostralegus" "Pyrrhocorax graculus" "Tyto alba" "Alcedo atthis" "Ciconia ciconia" "Upupa epops" "Merops apiaster" "Grus grus" "Phoenicopterus roseus" "Morus bassanus" "Caprimulgus europaeus" "Bubo bubo" "Aquila chrysaetos" "Tichodroma muraria" "Fratercula arctica" "Gypaetus barbatus" "Podarcis muralis" "Lacerta bilineata" "Anguis fragilis" "Natrix helvetica" "Hierophis viridiflavus" "Vipera aspis" "Emys orbicularis" "Testudo hermanni" "Bufo bufo" "Rana temporaria" "Salamandra salamandra" "Hyla arborea" "Epidalea calamita" "Triturus cristatus" "Cyprinus carpio" "Perca fluviatilis" "Esox lucius" "Salmo trutta" "Silurus glanis" "Salmo salar" "Hippocampus guttulatus" "Apis mellifera" "Bombus terrestris" "Coccinella septempunctata" "Aglais io" "Vanessa atalanta" "Pyrrhocoris apterus" "Papilio machaon" "Macroglossum stellatarum" "Vespa crabro" "Tettigonia viridissima" "Libellula depressa" "Calopteryx splendens" "Cetonia aurata" "Lucanus cervus" "Mantis religiosa" "Lampyris noctiluca" "Lyristes plebejus" "Saturnia pyri" "Rosalia alpina" "Parnassius apollo" "Araneus diadematus" "Eratigena atrica" "Argiope bruennichi" "Misumena vatia" "Buthus occitanus" "Cornu aspersum" "Lumbricus terrestris" "Helix pomatia" "Asterias rubens" "Rhizostoma pulmo" "Octopus vulgaris" "Homarus gammarus" "Myocastor coypus" "Periparus ater" "Corvus corax" "Prunella collaris" "Asio otus" "Culex pipiens" "Gerris lacustris" "Carcinus maenas" "Crangon crangon" "Littorina littorea" "Austropotamobius pallipes" "Pelophylax esculentus" "Pelophylax kl. esculentus" }
  ?item wdt:P225 ?name .
  ?item wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P141 ?status . }
}
"@
$wd = $null
try {
  $wd = Invoke-RestMethod -Method Post -Uri 'https://query.wikidata.org/sparql' -Body @{ query = $sparql } -Headers @{ 'User-Agent' = $headers['User-Agent']; 'Accept' = 'application/sparql-results+json' }
} catch { Write-Host ('   erreur Wikidata : ' + $_.Exception.Message) }
# 3. Correction des photos du lynx boreal et du grand-duc d'Europe
$out = Join-Path $here 'photos'
$fix = @()
foreach ($sci in @('Lynx lynx','Bubo bubo')) {
  try {
    $slug = (($sci.ToLower() -replace '[^a-z0-9]+','-').Trim('-'))
    $r = Invoke-RestMethod -Uri ("https://api.inaturalist.org/v1/taxa?q=" + [uri]::EscapeDataString($sci) + "&rank=species&locale=fr&per_page=10") -Headers $headers
    $t = $r.results | Where-Object { $_.name -eq $sci } | Select-Object -First 1
    Start-Sleep -Milliseconds 1100
    $full = Invoke-RestMethod -Uri ("https://api.inaturalist.org/v1/taxa/" + $t.id) -Headers $headers
    $photo = ($full.results[0].taxon_photos | ForEach-Object { $_.photo } | Where-Object { $_.license_code } | Select-Object -First 1)
    $url = $photo.medium_url
    $ext = [IO.Path]::GetExtension(([uri]$url).AbsolutePath).ToLower(); if (-not $ext) { $ext = '.jpg' }
    $file = 'fix-' + $slug + $ext
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $out $file) -Headers $headers -UseBasicParsing
    $fix += [pscustomobject]@{ id = $slug; sci = $sci; inat = $t.name; nomFr = $t.preferred_common_name; file = $file; licence = $photo.license_code; credit = $photo.attribution; source = ("https://www.inaturalist.org/photos/" + $photo.id) }
    Write-Host ("Photo corrigee : {0} ({1})" -f $t.name, $t.preferred_common_name)
    Start-Sleep -Milliseconds 1100
  } catch { Write-Host ('   erreur photo ' + $sci + ' : ' + $_.Exception.Message) }
}
[pscustomobject]@{ gbif = $gbif; wikidata = $wd; photos = $fix; date = (Get-Date -Format s) } | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 (Join-Path $here 'donnees-reelles.json')
Write-Host ("Termine : {0} especes, fichier donnees-reelles.json" -f $gbif.Count)
