# Bestiaire - repartition par departement (GBIF) pour les 135 especes
# Lancer : powershell -ExecutionPolicy Bypass -File .\donnees-departements.ps1
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel de jeu educatif)' }
function Get-Json($url) {
  for ($try = 1; $try -le 6; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $headers }
    catch {
      $code = $null; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 429 -or $code -ge 500) { Write-Host "   serveur occupe, nouvel essai dans $($try*5) s"; Start-Sleep -Seconds ($try*5) }
      else { throw }
    }
  }
  throw 'abandon apres 6 essais'
}
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
$res = @()
$i = 0
foreach ($sci in $species) {
  $i++
  Write-Host ("[{0}/{1}] {2}" -f $i, $species.Count, $sci)
  try {
    $name = $sci -replace ' kl\. ',' '
    $m = Get-Json ("https://api.gbif.org/v1/species/match?name=" + [uri]::EscapeDataString($name))
    $key = $m.usageKey; if ($m.acceptedUsageKey) { $key = $m.acceptedUsageKey }
    Start-Sleep -Milliseconds 600
    $o = Get-Json ("https://api.gbif.org/v1/occurrence/search?taxonKey=$key&country=FR&limit=0&facet=month&month.facetLimit=12&facet=gadmLevel2Gid&gadmLevel2Gid.facetLimit=200")
    $months = @{}; $deps = 0
    foreach ($f in $o.facets) {
      if ($f.field -eq 'MONTH') { foreach ($c in $f.counts) { $months[[string]$c.name] = $c.count } }
      else { $deps = @($f.counts | Where-Object { $_.count -ge 3 }).Count }
    }
    $res += [pscustomobject]@{ sci = $sci; key = $key; matchType = $m.matchType; rank = $m.rank; obsFR = $o.count; departements = $deps; mois = $months }
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message) }
  Start-Sleep -Milliseconds 600
}
$res | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $here 'donnees-departements.json')
Write-Host ("Termine : {0}/{1} especes" -f $res.Count, $species.Count)
