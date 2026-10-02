# Bestiaire - telecharge une photo libre par espece depuis iNaturalist
# Usage : clic droit > Executer avec PowerShell, ou : powershell -ExecutionPolicy Bypass -File .\photos-bestiaire.ps1
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here 'photos'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$headers = @{ 'User-Agent' = 'BestiaireProto/0.1 (prototype personnel)' }
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
function Slug($s){ return (($s.ToLower() -replace '[^a-z0-9]+','-').Trim('-')) }
$manifest = @()
$i = 0
foreach ($sci in $species) {
  $i++
  $slug = Slug $sci
  Write-Host ("[{0}/{1}] {2}" -f $i, $species.Count, $sci)
  try {
    $q = [uri]::EscapeDataString(($sci -replace ' kl\. ',' '))
    $r = Invoke-RestMethod -Uri "https://api.inaturalist.org/v1/taxa?q=$q&locale=fr&per_page=10" -Headers $headers
    $t = $r.results | Where-Object { $_.name -eq ($sci -replace ' kl\. ',' ') } | Select-Object -First 1
    if (-not $t) { $t = $r.results | Select-Object -First 1 }
    if (-not $t) { Write-Host '   introuvable'; continue }
    $photo = $null
    if ($t.default_photo -and $t.default_photo.license_code) { $photo = $t.default_photo }
    else {
      Start-Sleep -Milliseconds 1100
      $full = Invoke-RestMethod -Uri ("https://api.inaturalist.org/v1/taxa/" + $t.id) -Headers $headers
      $photo = ($full.results[0].taxon_photos | ForEach-Object { $_.photo } | Where-Object { $_.license_code } | Select-Object -First 1)
    }
    if (-not $photo) { Write-Host '   pas de photo sous licence libre'; continue }
    $url = $photo.medium_url
    $ext = [IO.Path]::GetExtension(([uri]$url).AbsolutePath); if (-not $ext) { $ext = '.jpg' }
    $file = $slug + $ext.ToLower()
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $out $file) -Headers $headers -UseBasicParsing
    $manifest += [pscustomobject]@{ id = $slug; sci = $sci; inat = $t.name; nomFr = $t.preferred_common_name; file = $file; licence = $photo.license_code; credit = $photo.attribution; source = ("https://www.inaturalist.org/photos/" + $photo.id) }
  } catch { Write-Host ('   erreur : ' + $_.Exception.Message) }
  Start-Sleep -Milliseconds 1100
}
$manifest | ConvertTo-Json -Depth 3 | Out-File -Encoding utf8 (Join-Path $out 'manifest.json')
Write-Host ("Termine : {0} photos dans {1}" -f $manifest.Count, $out)
