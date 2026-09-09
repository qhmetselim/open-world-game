# Open World Game — Engine Foundation

Browser tabanlı, uzun vadeli bir 3D açık dünya oyunu için motor temelidir. Aşama 6; deterministic şehir dünyasına tek sürülebilir development sedan, resmi Rapier raycast vehicle controller, güvenli enter/exit ve vehicle chase camera ekler. Trafik, NPC sürücüleri, araç sahipliği ve araç hasarı henüz yoktur.

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
  vehicle/       # Serializable vehicle state, Rapier controller, interaction ve lifecycle manager
  render/        # Renderer, kamera modları ve placeholder player görünümü
  city/          # Deterministic city region, road graph, road geometry ve chunk view'ları
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
