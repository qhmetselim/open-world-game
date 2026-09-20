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

## Aşama 10 — Traffic rules & safety

- `TrafficRuleNetwork`, mevcut bounded mobility network'ten plain approach/stop-line metadata üretir. En az üç yaklaşımı ve arterial bağlantısı olan kavşaklar sinyalize edilir; local kavşaklar priority/reservation kullanır. Road generator ve fizik tuning'i değişmez.
- Dünya seed'i + intersection ID faz ofsetini belirler. Her yaklaşım **12 s yeşil → 3 s sarı → 2 s all-red** alır. Muhafazakâr olarak tek yaklaşım serbesttir; mevcut tek-araç rezervasyonu aynı yaklaşımın çakışan dönüşlerini de ayırır. Kavşağa girmiş araç, faz değişse de rezervasyonunu çıkana kadar korur.
- Sarıdaki karar hız/fren mesafesine bağlıdır; güvenle duramayacak ve rezervasyonu olan araç geçişini tamamlar. Kırmızı ve dolu yaya geçidi, stop line önündeki hıza aynı `speedControl` pipeline'ı üzerinden sınır koyar. Teleport veya ayrı fren kontrolcüsü yoktur.
- Sinyalsiz kavşakta arterial > collector > local; aynı sınıfta straight > right > left uygulanır. **12 s** bekleyen talepler yeni yüksek öncelikli taleplerin önüne geçer; eşitlik FIFO/stable ID ile çözülür. Boş/stale lease süre aşımına uğrar, fiziksel olarak dolu kavşağın rezervasyonu başka araca verilmez.
- `NpcManager` spatial hash sorgusu yalnız yaklaşan crossing çevresini tarar; crossing üzerindeki veya route'una göre en fazla **3 m** uzaktaki girişe yürüyen aktif NPC'ye yol verilir. Aynı crossing sorgusu fixed tick boyunca paylaşılır. NPC sinyal fazı/AI davranışı değiştirilmez.
- Oyuncu aracı salt okunur engeldir; trafik kuralları oyuncunun input'una yazmaz. Following sorgusu dönüşün anlık gövde yönünü değil rota koridorunu kullanır; kırmızıda duran karşı şerit yanlış lider sayılmaz.
- `TrafficSignalView`: paylaşılan pole/housing ve lamp instance batch'leri + mevcut terrain-conforming marking ribbon helper'ından tek stop-line batch. Sinyaller collider eklemez. Bounded görünür yaklaşım kümesi değişince eski instance/geometry kaynakları temizlenir; simulation hesapladığı renkleri view'a geçirir.
- F3: signals / red wait / crossing yield. F8: rota hedefi ve stop target; kırmızı/sarı sinyal, mor yaya-yield, yeşil rezervasyon; ileri çizginin uzunluğu hedef hızı temsil eder. Yeni keybind yoktur.
- Uzun kuyruk sonrası motor komutu alan uyuyan Rapier gövdesi uyandırılır; parked-body sleeping korunur. Mass, suspension, engine/brake, steering, timestep ve interpolation baseline değerleri aynıdır.
- Development-only `/qa.html`: gerçek şehir/NPC/trafik gözlemcisi; `Signal intersection` ve `Traffic rules debug (F8)` ile görsel smoke QA. Bu sayfa production entry değildir.

Sınırlar: özel pedestrian signal phase, trafik cezası ve oyuncuya otomatik trafik kontrolü yoktur. Yoğun yaya akışı veya oyuncunun kavşağı fiziksel olarak bloklaması beklemeyi uzatabilir; güvenlik için dolu conflict area zorla serbest bırakılmaz.

## Aşama 15 — Economy, ownership & personal assets

- `economy/PersonalAssets` renderer/UI bağımsız session state sahibidir. Para **tam sayı kuruş** olarak tutulur; başlangıç **4.250 ₺**. `addMoney` / `spendMoney` negatif, küsuratlı, NaN veya unsafe tutarları reddeder. Yetersiz bakiye state'i değiştirmez.
- Stable ID + name + type metadata ile clothing, furniture, vehicle, home, personalItem ve permission/unlock entitlement kayıtları desteklenir. `purchase` bakiye ve ownership'i birlikte günceller; duplicate ID ikinci kez tahsil edilmez. Bu bir slot/stack inventory değildir.
- Wardrobe: top/bottom/shoes/outerwear/accessory kategorileri, owned clothing sorgusu ve yalnız sahip olunan kıyafeti category'ye equip/unequip etme. Furniture ayrı type sorgusuyla erişilir. Görünüm değiştirme, furniture placement, araç/ev gameplay'i yoktur.
- WorldState serialization'a plain `personalAssets` snapshot bağlanır; dışarı dönen kayıtlar kopyadır. Chunk unload ownership'i silmez. Disk/localStorage/save-load eklenmedi; sayfa yenilenince yeni session başlar.
- Sağ üstte sürekli DOM para HUD'u, Türkçe tutar biçimi ve kısa +/− göstergesi; F3'ten bağımsız, pointer-events yok. Mevcut contextual E resolver tek action çalıştırmaya devam eder.
- Yalnız development modunda spawn yakınına ikinci küçük use pedestal eklenir: **750 ₺ keten gömlek** satın alma örneği. `/interaction-qa.html?start=purchase` örneğin önünde başlar; QA kredi/harcama düğmeleri aynı ekonomi API'lerini kullanır. Production'da test satın alma nesnesi/QA para komutları aktif değildir. Mağaza UI'ı yoktur.
- Dört test para doğrulama, atomic/duplicate satın alma, generic ownership/wardrobe/serialization ve gerçek interaction manager üzerinden başarısız kullanım + chunk reload sahiplik davranışını kapsar.

## Aşama 17 — Basic combat foundation

- `combat/CombatState`, `CombatController`, `Health`: plain weapon/health state; tek başlangıç pistol'u. **34 damage, 4 shot/s üst sınır, 12 magazine + 60 reserve, 1.4 s reload, 90 m range**. Semi-auto: her sol click en fazla bir atış; reload/empty/cooldown kontrolleri fixed tick'te çalışır. Shop, inventory veya sınırsız ammo yoktur.
- **Q** equip/holster; pointer lock içindeyken **RMB basılı aim + LMB click fire**. **R** tek contextual owner tarafından tüketilir: yaya reload, araçtayken mevcut reset. E arbitration değişmez. Araç/development context silahı holster eder; reload iptal edilir. Pointer lock kaybı mouse intent'i temizler; ilk canvas kilitleme click'i ateş etmez.
- Kamera crosshair ray'i hedefi bulur; ardından göğüs→namlu clearance ve namlu→hedef ray'i yakın cover arkasına ateşi engeller. `PhysicsWorld.castCombatRay` mevcut Rapier terrain/building/vehicle query layer'larını kullanır ve self'i dışlar. En fazla aktif NPC population'ı için Rapier capsule narrow-phase kullanılır; NPC hit şekilleri world collider/body yaratmaz, suspension/player collision davranışına karışmaz.
- NPC health sıfırda `dead`: route/movement durur, gore/ragdoll yerine düşük maliyetli yatık model görünür. Yalnız hasar almış kimliklerin health'i session içinde streaming reload boyunca korunur; view kaynakları eski bounded lifecycle ile temizlenir. Bu kayıtlar oyuncunun hasar verdiği NPC sayısıyla büyür; disk/save sistemi değildir. PlayerState health serileştirilebilir ve PlayerController.damage gelecekteki combat için hazırdır.
- `weaponFired`, `npcDamaged`, `npcKilled` plain olayları unsubscribe edilebilir listener API'sinden çıkar; sınırsız event history tutulmaz. Polis/wanted, NPC combat AI veya vehicle shooting eklenmedi.
- Procedural pistol, kısa muzzle flash, DOM crosshair/ammo/HP/hit feedback. Aim sırasında mevcut smoothed/collision-aware player camera target'ı **0.8 m omuz yanına** kayar; normal kamera, jump/interpolation ve fizik tuning'i değişmez. View/material ownership dispose edilir.
- **174/174 test**: 6 yeni test; cadence/ammo/reload, health, pointer lock input izolasyonu, gerçek Rapier world occlusion/self exclusion/NPC death ve streaming, muzzle cover/range/vehicle fire yasağı ve smooth aim-camera geçişi. Mevcut 168 regression testi korunur.
- Browser: ana oyunda equip/görünüm ve E vehicle enter/holster/safe exit smoke başarılı (~120 FPS sabit sahnede). `/combat-qa.html` açıkça işaretlenmiş development-only izole fixture; simüle pointer komutlarıyla **aynı gerçek Rapier, NPC, CombatController ve view** üzerinden hasar/ölüm/reload/context yasağı doğrulanır. Gömülü browser pointer lock alamadığı için gerçek mouse hold/orbit hissi manuel QA gerektirir: canvas → Q → RMB + LMB → R → E. Bu fixture normal oyun input kısıtlarını değiştirmez.

## Aşama 16 — Multi-vehicle access & takeover

- E arbitration korunur: araçtayken güvenli çıkış; yaya iken odaklanmış world interaction, ardından en yakın uygun araç. Başlangıç sedanı ve aktif trafik araçları aynı **5 m** erişim / **1.2 m/s** azami giriş hızı kuralını kullanır. Mesafe eşitliğinde stable ID belirleyicidir; farklı katlardan giriş engellenir.
- `TrafficManager.takeOver` mevcut Rapier chassis, dört tekerli controller ve aynı görünümü `VehicleManager`'a aktarır. Yeni araç/body/view yaratmaz; hız, suspension ve appearance korunur. AI kaydı/spatial index/reservation temizlenir, procedural kimlik session boyunca tekrar spawn edilmez. Player-specific camera/input AI'ya bağlanmaz.
- Ortak `VehicleController`/`VehicleManager` sürüş, interpolation, view lifecycle ve `player/parked` durumunu yönetir. Çıkış bütün araçlarda aynı kapsül-clearance sorgusunu kullanır. Bırakılan araç frenli PARKED olur; tüm etkin managed araçlar AI following/intersection için spatial obstacle index'ine girer.
- Devralınan araçlar AI despawn/recycle/background politikasına tabi değildir. Uzak PARKED araçta terrain unload olduğunda aynı body devre dışı bırakılır ve görünüm gizlenir; dönüşte aynı transform/body etkinleşir. Bu session-only saklama oyuncunun devraldığı araç sayısıyla büyür; ownership, garage veya disk persistence değildir. Game dispose view'ları shared traffic material'lardan önce, ardından controller/body'leri temizler.
- Chase camera, speed HUD, streaming focus ve F6 seçilen araçtan bağımsız çalışır; F3 managed count ve control state gösterir. Physics/steering/suspension tuning değişmedi.
- `/interaction-qa.html?start=traffic` development smoke: düğme yalnız oyuncuyu mevcut yavaş AI aracının güvenli yanına yerleştirir; araç konumu/hızı override edilmez. Sonraki E, W ve handbrake normal InputManager/Game akışıdır. İki farklı trafik aracına giriş → sürüş → güvenli çıkış → ikinci giriş browser'da doğrulandı (~112–120 FPS, console warn/error yok).
- **168/168 test**, typecheck/lint/build başarılı. İki yeni test erişim filtresini ve gerçek Rapier iki araç transferini, sağ dönüş/fren, parked obstacle, uzak unload/geri yükleme, duplicate kimlik önleme ve tam dispose'u doğrular. Mevcut regression suite korunur. Rapier kaynaklı Vite büyük bundle uyarısı devam eder.

## Aşama 14 — Building & interior foundation

- `interiors/InteriorLayout`: renderer-independent, deterministic ground-floor plan. Owner chunk başına stable-ID sırasıyla ilk uygun giriş ENTERABLE; diğer binalar NON_ENTERABLE kalır. Mevcut building seed, footprint, floor height ve Stage 11 kapısı kullanılır; yeni input/interaction sistemi yoktur.
- Uygunluk: en az 8 m footprint, güvenli terrain örnekleri ve en fazla 0.85 m temel/giriş kot farkı. Kısa vestibule rampası kot farkını fiziksel olarak bağlar; terrain veya player tuning değişmez. Giriş deliği dış facade ve compound collider'da aynıdır; açıklığı kapatan dekoratif giriş paneli/pencere bastırılır.
- Ground floor: 3.2 m koridor, iki yan oda ve açık geçişler, zemin/tavan. Kat yüksekliği mevcut building config'ten gelir. Üst katlar kapalı exterior volume olarak kalır; mobilya, çok katlı simulation veya gameplay interior türleri yoktur.
- `InteriorRuntime`: footprint'e 12 m yaklaşınca oda/rampa/tavan kaynaklarını aktive eder, 20 m dışında bırakır; içerideyken korunur. Bina dış kabuğu ve foundation chunk'a aittir. Odalar tek compound Rapier body, üç instanced material batch ve paylaşılan geometry/material kullanır. Camera raycast mevcut building collision layer'ı kullanır, yeni camera/physics tuning yoktur.
- Chunk unload aktif interior kaynaklarını kaldırır; mevcut `WorldInteractions` door registration/session state lifecycle'ını yönetir. Yeniden yüklemede aynı plan üretilir. Disk persistence veya teleport/loading geçişi eklenmedi.
- Development smoke: `/interaction-qa.html?start=interior` yalnız başlangıçta uygun kapı önünde açılır. E ile aç, W ile gir; koridor duvarları collision sağlar. QA düğmeleri gerçek InputManager üzerinden süreli hareket eder. İki odaklı test gerçek Rapier giriş/duvar/çıkışını ve determinism/unload/reload temizliğini doğrular.

## Aşama 13 — Environment variety

- `environment/EnvironmentGenerator`: plain, regeneratable descriptors. Seed + global road ID/slot veya world-space scatter cell, stable ID ve half-open centre chunk ownership kullanılır. Chunk yükleme sırası/generation cache sonucu değiştirmez. Ziyaret geçmişi saklanmaz.
- İki low-poly tree silhouette (yuvarlak/conifer), değişken ölçek/yükseklik/ton; bush, lamp, bench, bin, directional sign, bollard ve utility box. Harici asset/texture, gerçek lamba ışığı, interaction veya yeni collision yoktur. Tüm prop'lar bu aşamada visual-only'dir.
- Yol kenarı adayları 18 m slotlardan seçilir; tüm slotlar dolmaz. 32 m hücreli seyrek açık-alan vegetation, roadside furniture bandına girmez. Road+sidewalk, kavşak uçları, döndürülmüş bina footprint'leri, girişler ve player spawn için clearance uygulanır; aşırı eğimli adaylar elenir. Bench/tabela/lamba yola dönüktür; yürüyüş koridoru açık kalır.
- Region bazlı residential/urban/outskirts profilleri yalnız yoğunluğu değiştirir. Aşama 12 palette/sky/fog/light ve mevcut simulation korunur. Ayarlar `EnvironmentConfig`, yeni renkler `VisualTheme.environment` içindedir.
- Dokuz paylaşılan merged template + tek vertex-color material; chunk/type başına InstancedMesh. Yalnız ağaç/lamba gölge üretir. Küçük/büyük batch culling mesafeleri chunk sınırına göre **100/260 m**, hysteresis **12 m**; ayrıca normal frustum culling korunur. Chunk başına üst sınır **80 prop**.
- Unload instance buffers ve scene kayıtlarını temizler; shared geometry/material yalnız World dispose'da temizlenir. F3 environment mesafe filtresinden geçen/toplam prop, view ve profile gösterir (frustum görünürlük sayısı değildir). `/qa.html` içindeki Stream +4 chunks / Return origin kısa lifecycle smoke içindir, gameplay teleport değildir.
- İki odaklı test determinism/ownership/yol clearance/culling/shared-resource lifecycle'ı kapsar; mevcut World traversal testi bounded environment view/prop sayısını da doğrular.

## Aşama 12 — Stylized visual foundation

Render-only tema `render/VisualTheme.ts` içindedir: sıcak daylight, serin gölgeler, adaçayı terrain, taş kaldırımlar, kömür grisi asfalt ve uyumlu dört facade tonu. Procedural seed/appearance kimlikleri değişmez; NPC/traffic renk çeşitliliği mevcut deterministic metadata'dan gelir.

- `ProceduralSky`: kamera merkezli gradient + geniş güneş halesi, tek düşük-poly mesh; asset/texture/post-process yok. Ufukla aynı renk atmospheric fog **150–340 m** aralığındadır. sRGB output + ACES, exposure **1.0** korunur.
- Directional sun **3.1**, hemisphere **1.65**. **2048²** shadow map, yakın kamera çevresinde **130 m** genişlik; light-space texel snapping hareket sırasında shadow swimming'i azaltır. Tüm camera modlarında sadece view focus takip edilir; streaming/fizik değişmez. Atmosfer/gölge kaynaklarını SceneManager, entity kaynaklarını mevcut view sahipleri temizler.
- Terrain renkleri lineer renk uzayında, world-coordinate geniş dalga/height karışımıdır; ortak chunk kenarları aynı rengi alır. Terrain/road/sidewalk yükseklikleri ve collision/topology değişmez.
- Binalar mevcut deterministic flat/parapet/utility roof seçeneklerini korur. Çatı parçaları tek material batch'inde birleştirilir. Opaque pencerelerde shared vertex-colour sky gradient; ince denizlikler chunk başına tek ek instance batch. Camlar için reflection/transparency/interior pass yoktur.
- Karakterler ortak mat daylight görünümü kullanır. Player/traffic sedanlar aynı eğimli kabin helper'ını ve vertex-colour jant/lastik geometri helper'ını kullanır; ek wheel draw call yoktur. Kapı/toggle tema renkleri ve gölgeleri güncellenmiştir; interaction davranışı değişmez.
- Görsel smoke için mevcut development `/qa.html` sayfasında **City panorama** görünümü vardır. Üretim girişine yeni UI/keybind eklenmez. Fizik/gameplay tuning'i, NPC/traffic AI ve world-generation değiştirilmez.

## Aşama 11 — World interaction foundation

- `interaction/InteractionState`: plain descriptor/state, stable ID, enabled/radius/anchor/label, door ve toggle state machine. `InteractionManager` aktif kayıtları, mevcut spatial hash'i ve yalnız değişmiş objelerin session state'ini sahiplenir. State içinde Three.js/Rapier nesnesi yoktur; disk/localStorage persistence yoktur.
- Hedef seçimi: **2.8 m** menzil, oyuncunun **-Z forward** yaw convention'ı, facing/distance skoru, stable-ID tie-break ve en son merkezi Rapier LOS sorgusu. Self ve hedefin kendi collider'ı dışlanır; aradaki bina/terrain/araç bloklamaya devam eder. Sorgu yalnız local spatial hücrelerde çalışır.
- E tek yerde tüketilir: **araç içindeyken exit → yaya iken geçerli world focus → vehicle enter fallback**. Bir press yalnız bir action çalıştırır. Aynı DOM prompt kapı için Open/Close Door, toggle için Enable/Disable Indicator veya vehicle Enter/Exit gösterir. Araçtayken world focus kapalıdır.
- `WorldInteractions`, yalnız streaming revision değişince read-only chunk/building içeriğini inceler. Building owner chunk başına en fazla bir deterministic, terrain ve street-clearance doğrulanmış giriş ekler. Bina collider'ı korunur: dışarıya **1.8 m** uzanan, üstü açık küçük giriş boşluğunun arkasında private bina hacmi kapalıdır; interior sistemi yoktur.
- Kapı **1.6 × 3 m**, kalınlık **0.12 m**, hareket süresi **0.65 s**. Closed → Opening → Open → Closing. `InteractionPhysics` aynı menteşe matematiğiyle fixed tick'te mevcut static leaf collider'ını döndürür; `InteractionView` previous/current açıları render alpha ile interpolate eder. Collider her frame yeniden üretilmez. Açık yaprak yana çekilir, geçiş boşalır. Occupant shape query kapanmanın oyuncu/araç üzerine yapılmasını engeller; engellenen kapanma yeniden açılır.
- Başlangıcın yakınında tek `interaction:development-toggle` sütunu vardır; üst gösterge E ile kırmızı/yeşil olur. Bu ikinci örnek aynı discovery, prompt, dispatch ve lifecycle'ı kullanır; yeni gameplay mechanic değildir.
- Door view başına iki instanced batch (frame ve leaf/handle), toggle için bir batch; tümü ortak unit box ve material kullanır. Unload kayıt/spatial index/focus/view/instance buffers ve Rapier body'lerini temizler. Shared kaynaklar yalnız manager dispose'da temizlenir. Session içinde kullanılan objeler reload'da durumlarını korur; hiç kullanılmayan visited objeler tutulmaz.
- F3 yalnız interactable count ve focused ID ekler; yeni keybind yoktur. Mevcut player/vehicle/traffic fizik tuning'i ve loop değişmemiştir.
- Development-only **`/interaction-qa.html?start=door`**, `toggle` ve `vehicle` başlangıç fixture'ları gerçek `Game` kullanır. İlk konum dışında transform override yoktur. Süreli hareket düğmeleri tarayıcı sürücüsünün hold sınırlaması için normal keyboard event'lerini InputManager'a yollar. E, collision, motion, camera, speed HUD ve streaming üretim akışıdır. Normal `/` başlangıcı değişmez; QA sayfası production entry değildir.

Doğrulama: 7 yeni test; focus/range/facing/occlusion, tek E arbitration, reversible door/toggle state, gerçek Rapier closed-door blockage → E → passage, occupied closure safety, session reload ve bounded chunk lifecycle. Mevcut vehicle/traffic/NPC/steering/jump/traversal regression testleri korunur. Küçük girişler full interior değildir; büyük pitch/orbit açılarında kamera normal collision kısıtlamasını uygulayabilir.
