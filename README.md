# Open World Game — Engine Foundation

Browser tabanlı, uzun vadeli bir 3D açık dünya oyunu için motor temelidir. Aşama 9 ambient NPC ve AI trafik sistemlerini içerir. Aşama 9.5 mevcut fizik, hareket, yol bütünlüğü ve kaynak yaşam döngüsünü stabilize eder; yeni gameplay sistemi eklemez.

[Aşama 9.5 teknik audit, ölçümler ve kalan riskler](docs/physics-foundation-audit.md)

## Stack

- TypeScript (strict)
- Vite
- Three.js
- `@dimforge/rapier3d-compat`
- DOM tabanlı UI
- Vitest + ESLint

## Komutlar

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run dev` komutundan sonra Vite'ın gösterdiği yerel URL'yi açın. Canvas'a tıklayarak mouse'u yakalayın; yaya iken WASD hareket, Shift koşu ve Space zıplamadır. Başlangıç road corridor'undaki sedana yaklaşınca `E` ile binilir. Araçtayken WASD throttle/steering/brake-reverse, Space handbrake, `E` güvenli çıkış, `R` vehicle reset'tir. F2 gameplay/development kamera arasında geçiş yapar; F3 HUD, F4 road graph, F5 building ve F6 vehicle physics debug görünümünü açıp kapatır.

## Klasör yapısı

```text
src/
  core/          # Game lifecycle, zaman ve fixed-step loop
  simulation/    # Serializable, render'dan bağımsız world/entity state
  physics/       # Rapier, terrain ve kinematic character collider'ları
  player/        # Serializable player state, input-to-movement ve controller
  npc/           # Deterministic identity, pathfinding, spatial hash ve NPC simulation
  traffic/       # Lane following, validated spawn, reservation ve active/background AI
  vehicle/       # Serializable vehicle state, Rapier controller, interaction ve lifecycle manager
  render/        # Renderer, kamera modları ve placeholder player görünümü
  city/          # Deterministic city/road/lane/yaya graph'ları ve chunk view'ları
  buildings/     # Serializable building data, deterministic generation ve placement math
  input/         # Physical input -> semantic game action eşlemesi
  world/         # Seed, terrain üretimi, chunk koordinatı ve streaming
  ui/            # DOM HUD ve hata ekranı
  diagnostics/   # FPS, frame-time ve render sayaçları
```

## Mimari ilkeler

- Simulation state, Three.js nesnelerinden bağımsızdır ve serileştirilebilir.
- Three.js yalnızca görünüm katmanıdır; render view'ları simulation/world data'dan türetilir.
- Rapier fixed timestep ile çalışır; render döngüsü requestAnimationFrame tabanlıdır.
- Physical input tek bir `InputManager` içinde semantic action'lara dönüştürülür.
- HUD ve hata durumu WebGL canvas'ı yerine DOM ile çizilir.
- Player gameplay state'i ve placeholder Three.js görünümü ayrı katmanlardadır.

## Procedural world ve streaming

- `open-world-001` world seed'i, string hash üzerinden deterministic noise alanına dönüşür. Aynı seed aynı terrain'i üretir.
- Chunk boyutu 128 world unit, terrain çözünürlüğü chunk başına 24×24 quad'dır.
- Normal third-person modda player streaming focus'tur; F2 development modunda focus aktif development kameraya geçer.
- Focus çevresinde 2 chunk yarıçapı (25 başlangıç chunk'ı) aktif tutulur. 3 chunk unload yarıçapı sınırda load/unload titremesini önler.
- Her chunk tek terrain mesh'i ve aynı height buffer'dan türetilen static Rapier triangle-mesh collider'ı kullanır. Unload; scene, geometry ve fizik gövdesini temizler.
- Development modunda ince mavi chunk sınırları görünür. F3 HUD seed, focus, koordinat, aktif/toplam chunk ve load/unload sayaçlarını gösterir.

## Third-person player

- Player; Rapier kinematic position-based body, kapsül collider ve `KinematicCharacterController` kullanır. Controller slope limiti ve snap-to-ground ile terrain üzerinde stabil hareket eder.
- Spawn yüksekliği terrain height provider ile belirlenir; capsule center terrain yüksekliğine göre konumlanır.
- Third-person kamera player state'ini takip eder, mouse yaw/pitch ile orbit eder ve terrain collider'larına karşı raycast ile mesafesini kısaltır.
- Pointer Lock ilk yüklemede zorlanmaz; yalnızca canvas click sonrası talep edilir. Escape browser tarafından serbest bırakır.
- F2 development kamera moduna geçer. Normal modda streaming focus player; development modunda aktif development kameradır.

## Procedural city layout ve roads

- City layout, 512×512 world-unit macro region'larda deterministic olarak üretilir. Spawn çevresindeki region'lar urban; uzaktakiler deterministic urban/non-urban coverage kullanır.
- Arterial yollar region kenarlarında ortak seed key'leriyle üretilir; komşu region'lardaki edge node ID'leri ve koordinatları aynıdır. Urban region'lar arterial yollara bağlı, sınırlı yoğunlukta local semi-grid yollar ekler.
- Road graph (`RoadNode`, `RoadSegment`) ve block/parcel verileri plain TypeScript veri modelleridir; Three.js nesnesi içermez. Bounded LRU cache evict edilen region'ı gerektiğinde aynı layout ile yeniden üretir.
- Terrain chunk yüklenirken görünür road segment'leri world-coordinate clipping ile tek `RoadChunkView` geometry batch'inde çizilir. Mesh, terrain height query ile örneklenir; unload sırasında geometry ve debug kaynakları temizlenir. Road'lar terrain collider'ına ayrı collider eklemez.
- F3; city region, active road views, visible segment, graph, block ve parcel sayaçlarını gösterir. Development modunda F4, road center-line/node debug görünümünü açar.

## Urban mobility ve navigation foundation

- Road data renderer'dan bağımsız kalır; `UrbanMobilityNetwork`, stable lane ID'leri, right-hand trafik yönleri, lane-to-lane turn bağlantıları, intersection metadata'sı, pedestrian node/connection graph'ı ve crossing metadata'sı üretir.
- Local/collector/arterial road sınıfları için lane sayısı, metadata hızı, lane genişliği ve marking profili merkezi config'tedir. Mevcut generator local ve arterial üretir; collector sınıfı ileri bölgelendirme için hazırdır.
- Her road chunk'ı road yüzeyinin iki yanında terrain'e uyan kaldırım, görsel curb, batched lane marking ve intersection yakınında zebra crossing geometry'si üretir. Bunların her biri chunk başına tek merged mesh'tir; unload sırasında yalnız geometry kaynakları temizlenir, shared material'lar World lifecycle'ında sahiplenilir.
- Lane ve yaya graph'ları plain TypeScript verisidir. `World` üzerinden nearest lane, nearest pedestrian node, lane/intersection lookup, outgoing lane ve pedestrian connection sorguları kullanılabilir. Region/chunk sınırında shared node ID'leri ile lane continuation ve pedestrian corner bağlantıları deterministic olarak tekrar oluşur.
- F3 mobility sayaçlarını; F4 road centerline/node çizimlerine ek olarak lane centerline, sidewalk connection ve crossing debug çizimlerini gösterir. F4 kapatıldığında debug geometry görünmez kalır; production'da debug material'ları oluşturulmaz.

## Pedestrian ambient life

- Her procedural NPC, world seed ve stable pedestrian-node ID'sinden türetilen serializable identity, isim, görünüş, yürüyüş hızı ve navigation state taşır. NPC runtime view'ları persistent state değildir.
- `NpcManager`, active ve background simulation tier'larını hysteresis ile ayırır. Yakındaki en fazla 20 NPC view ve fixed-step movement alır; uzak NPC'ler lightweight state olarak tutulur veya uzaklaştıklarında deterministik biçimde tekrar oluşturulmak üzere bırakılır.
- A* pathfinding, mevcut sidewalk/corner/crossing pedestrian graph'ını kullanır; erişilemeyen hedefler deterministic olarak atlanır. NPC'ler node-to-node yürür, kısa idle sonrası yeni hedef seçer ve crossing edge'lerini normal graph bağlantısı olarak kullanır.
- NPC'ler dynamic Rapier body kullanmaz. Sidewalk graph bina/road güvenlik constraint'idir; active agent'lar küçük bir spatial-hash tabanlı personal-space separation uygular ve player'ı sert biçimde bloklamaz.
- Low-poly humanoid view; shared primitive geometriler ve palette material cache kullanır. Limb swing/body bob yalnız görünüm katmanındadır. F3 NPC population telemetrisi, F7 ise active NPC facing marker debug görünümünü açar.

## Procedural buildings

- `BuildingData`; parcel, region, footprint, floors, style, terrain foundation, giriş ve road-facing orientation bilgisini renderer'dan bağımsız tutar.
- Urban parcel'lar `%82` deterministic occupancy ile residential, commercial veya mixed-use bina üretir. Building footprint’leri parcel bounds, front/side/rear setback ve spawn güvenlik yarıçapı içinde kalır.
- Binalar upright kalır. Footprint altındaki merkez ve köşe terrain örneklerinden en yüksek nokta base elevation olarak kullanılır; aşağıdaki farkı küçük bir procedural foundation/plinth kapatır.
- Aktif terrain chunk, bina merkezi kendi chunk’ında olan binaların deterministic owner’ıdır. Unload hysteresis owner chunk’ı ekranda yeterince uzun tutar; view, geometry ve Rapier collider’ları birlikte temizlenir.
- Chunk başına facade palette, foundation, roof, window ve entrance için paylaşılan unit-box geometry ile `InstancedMesh` batch’leri kullanılır. Pencereler ayrı mesh değildir. Flat/parapet/utility roof türleri, kontrollü material palette ve giriş paneli görsel çeşitlilik sağlar.
- Her bina bir tane döndürülmüş static Rapier cuboid collider kullanır. Aynı collider mevcut third-person camera raycast’ine doğal olarak dahil olur. F5; chunk-batched footprint ve entrance direction debug çizimlerini açar.

## Drivable development sedan

- Sedan, kurulu Rapier sürümünün resmi `DynamicRayCastVehicleController` API'sini kullanır: dynamic chassis cuboid + dört raycast wheel, configurable suspension, engine/brake/reverse, hız-bağımlı steering, grip ve handbrake.
- `VehicleState` tamamen plain serializable veridir; `VehicleController`, `VehicleView` ve `VehicleManager` physics, render ve entity lifecycle sorumluluklarını ayırır. Low-poly görünümde front-wheel steering ve Rapier wheel rotation görsel olarak güncellenir.
- Araç spawn'ı deterministic nearest-road projection ile road heading'e hizalanır. Parklı araç suspansiyonuyla settle olur ve park freniyle yerinde tutulur.
- `E` girişinde player kapsül collider'ı kaldırılır, view gizlenir, streaming focus ve kamera VehicleChase'e geçer. Çıkışta world-space driver/passenger/rear/front candidate'ları terrain height ile konumlanır ve Rapier capsule shape-intersection ile bina/chassis çakışmaları reddedilir. Hiç güvenli nokta yoksa çıkış yapılmaz.
- Vehicle camera player kamerasından ayrı orbit/pitch/smoothing config kullanır; terrain/building collision raycast'i aracın own rigid body’sini filtreler. F6 chassis/suspension/forward debug görünümünü açar; F3 vehicle telemetry ve speed bilgisini gösterir.

## Geleceğe hazırlık

WorldState; persistent seed, entity ve region durumlarını tutar; runtime render chunk'ları save state'e girmez. Render/simulation ayrımı; ileride LOD, instancing, object pooling, spatial indexing, worker'lar, glTF/GLB, Draco/Meshopt ve KTX2 eklenmesine elverişlidir. Web Worker tabanlı veya öncelik kuyruklu terrain generation henüz uygulanmamıştır.
