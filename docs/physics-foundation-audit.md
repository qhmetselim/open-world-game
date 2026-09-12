# Aşama 9.5 — Physics & World Motion Audit

13 Eylül 2026. Başlangıç: `f1bacdf` (110 test). Kapsam mevcut sistemlerin stabilizasyonudur; Aşama 10, yeni gameplay, asset veya dependency eklenmedi.

## Kanıt ve yeniden çalıştırma

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Son tam koşu: **135/135 test, 47 test dosyası**, typecheck/lint/build başarılı. Başlangıçtaki 110 test korundu, 25 regression/stress testi eklendi. Son iki tam suite yaklaşık 27–31 saniye sürdü; makine yüküne göre uzun traversal süresi değişebilir.

`http://127.0.0.1:5173/qa.html` yalnız development ortamında gerçek World, Rapier, TrafficManager, NpcManager ve renderer kullanan görsel inceleme sahnesidir. Üretim girişine dahil değildir. Kamera gözlemcidir; araç transformlarını değiştirmez. Kavşak, araç ve yaya takip düğmeleri ile mevcut F4 görünümü vardır. Test fixture kamera konumu komşu binanın içine girmeyecek biçimde yol üzerinde tutulur; gameplay kameralarının yerini almaz.

## Core / physics

- Simulation 60 Hz; accumulator, delta clamp ve substep sınırı korundu. Floating-point birikimin tam tick'i eksiltmesi toleranslı bölme ile düzeltildi.
- `MotionHistory` önceki/güncel plain position + quaternion saklar. Render alpha üzerinden position lerp ve shortest-path quaternion slerp uygulanır. Teleport/reset/enter-exit geçmişi sıfırlar. Player, player sedan ve aktif trafik kullanır; Three.js state içinde değildir.
- Kamera ve view aynı interpolated transformu tüketir. Streaming authoritative simulation konumunu kullanır; render gecikmesi chunk odağını geriye çekmez. Development kamera istisnası korunur.
- Normal KCC hareketinde hem `setTranslation` hem `setNextKinematicTranslation` çağrılıyordu. Artık sadece sonraki kinematic hedef yazılır; doğrudan transform yazma yalnız açık reset/teleport sınırındadır.
- Yeni oluşturulan statik collider'lar ilk Rapier step'te sorgu yapısına kaydolmadan kapsül hareket ettirilebiliyordu. İlk sorgu hazır olana kadar hareket durdurularak başlangıç penetrasyonu engellendi.
- Terrain, building, player, player vehicle, traffic ve query membership'leri merkezi `CollisionLayers` içinde. Kamera terrain/building/vehicle/traffic görür; player membership'i ve ayrıca kontrollü body hariçtir. Ground sorgusu terrain/building, boşluk sorgusu blocking entity membership'lerini kullanır.
- Road/sidewalk/curb görseldir: aynı yerde ikinci üst üste fizik yüzeyi yoktur. Terrain mesh ve terrain trimesh aynı height buffer'dan oluşur. Building cuboid'leri gerçek engeldir.
- `PhysicsHealth` finite kontrolleri test içindir; her production frame'de tüm world taranmaz. Topology validator da hot path'te çalışmaz.
- World cache'leri, NPC/traffic view'ları, Rapier controller ve gövdeler açık owner tarafından dispose edilir. NPC ArrowHelper'ın Three.js global primitive geometrisi view başına yanlış dispose edilmemesi için owned clone kullanılır; local facing oku artık yaw'ı iki kez uygulamaz.

## Road root causes ve topology

1. Intersection yüzeyi üçgen winding'i aşağıya bakıyordu. Tek taraflı material üstten back-face culling yapıyor, doğru veride bile görsel boşluk oluşuyordu. Winding +Y yönüne düzeltildi; polygon offset ile gizlenmedi.
2. Local grid'in region iç marjında biten kısa yolları vardı ancak kasıtlı bitiş metadata'sı yoktu. Yalnız gerçekten authored margin'deki derece-1 uçlar `culDeSac`, region sınırı `regionBoundary` olarak sınıflanır. Diğer derece-1 uçlar hata kalır. Spawn/layout'u değiştiren kaba stub silme yaklaşımı kullanılmadı.
3. Grade kontrolü başarısız segment sessizce atlanıyordu. Artık generation açık hata verir; gizli kopuk network oluşturulmaz. Bu, her olası seed/terrain için otomatik rerouting iddiası değildir.
4. Yaya geçişleri kavşak merkezinde aynı bandı paylaşıyordu. Stable IDs korunarak node/crosswalk konumları yaklaşım bandına çekildi; dash'ler bu bandın dışında başlar. Crosswalk stripe'ları kaldırım aralığı yerine yalnız road genişliğini kaplar.

Intersection'ın deterministic owner/segment termination ve chunk clipping kuralları korunur. Generation sırası değiştirilerek sonuç eşitliği, surface winding ve eski seam/ownership testleri çalıştırıldı.

16×16 chunk eşdeğeri audit, 16 macro region:

| Ölçüm | Sonuç |
|---|---:|
| Road segment | 541 |
| Connected component | 1 |
| Kasıtlı cul-de-sac | 154 |
| Audit pencere sınırı çıkışı | 16 |
| Invalid endpoint / orphan road | 0 / 0 |
| Unexpected dead end | 0 |
| Disconnected / unreachable lane | 0 / 0 |
| Invalid intersection connection | 0 |
| İç macro sınırı bağlantı hatası | 0 |

Bu sayılar test edilen seed ve penceredir; sonsuz dünyanın matematiksel ispatı değildir. Cul-de-sac ayrı metadata olarak raporlanır, sıfır hata sayısına saklanmaz.

## Player

- Walk/sprint 7/12 m/s; grounded acceleration 38, deceleration 48, air acceleration 12 m/s². Kontrol hızı collision-corrected hızdan ayrıldı. Aksi halde her zemin contact düzeltmesi sonraki tick'te yeniden ivmelenmeye neden olup inişten sonra yapışkan yürüyüş üretiyordu.
- Kapsül radius .4, half-height .6; skin .02 m, snap .2 m, slope limit 45°. Autostep .25 m, minimum width .2 m; dynamic body üzerine autostep kapalı.
- Jump speed 8 m/s, gravity 24 m/s² korundu. Grounded bilgisi Rapier KCC'den; hızın sıfır olmasıyla tahmin edilmez. Air jump ve A/D mapping değiştirilmedi.
- Gerçek 15° terrain slope: yukarı 15.698 m, aşağı 16.916 m / 2.5 s; her iki yönde 150/150 grounded tick. 60° tırmanış reddedildi, düz yaklaşım dahil 1.761 m ilerledi. .15 m curb aşıldı, uzun duvar bloke etti.
- 100 jump/landing: apex yaklaşık 1.4001 m, toplam zemin drift 0.00000345 m; geç iniş frame'lerinde grounded, NaN yok. Smoothed render target'ın maksimum dikey adımı .11495 m (60 Hz fixture). Bu bir screenshot jitter benchmark'ı değil, gerçek physics + camera math testidir.
- Player mesh feet/body origin, collider yarı yüksekliği ile açık hizalanır.

### Render FPS karşılaştırması

Aynı 600 physics tick'i 30/60/120/144 render FPS ile çalıştıran fixture'da dört sonuç aynıdır:

| Ölçüm | Her FPS'teki sonuç |
|---|---:|
| Player yürüyüş mesafesi | 63.521164 m |
| Jump apex world Y | 2.420066 m |
| Airborne süre | 40 tick / .6667 s |
| Sedan fren başlangıcı hızı | 8.544783 m/s |
| Fren mesafesi | 4.396225 m |
| Traffic lane progress | .92251339 |

100 ms spike testinde substep sınırı korunur; gerçek araç transform/hızları finite, aşırı impulse/konum sıçraması yoktur. Player/vehicle kamera smoothing'i `1-exp(-rate*dt)` kullanır. Nihai smoothed göz pozisyonu da collision ray'iyle sınırlandırılır; yalnız desired camera'yı kırpmak smoothing sırasında duvar arkasında göz bırakabiliyordu.

## NPC locomotion

Ham A* node'ları sert waypoint hareketi ve anında hız değişimleri yaratıyordu. `NpcRoute` küçük quadratic corner fillet'leri üretir: .6 m corner radius, en fazla komşu edge uzunluğunun dörtte biri; testte raw corridor'dan sapma ≤.151 m. Graph IDs, sidewalk/crossing bağlantıları ve deterministic pathfinding değişmez.

Acceleration/deceleration 2.4/3.2 m/s², anticipation 1.4 m; yavaşlayan köşe yaklaşımı ve sınırlı angular dönüş kullanılır. Spatial-hash separation yerel .3 m corridor ile sınırlandırılır; kümülatif push ile yola kaçış azaltılır. Bu tam kalabalık çözümleyicisi değildir.

Walkable street-layer query korunur. Crossing/sidewalk context'i raw graph edge'inden alınır, smooth intermediate node ID'si surface türünü yanlış değiştirmez. Feet offset 1.06 × heightScale; final world Y doğru street surface'ten gelir. Limb swing gerçek yatay hıza bağlandı, idle'da durur. Background simulation ve 20 active/rendered limiti korundu.

## Sedan

Kurulu Rapier 0.20 resmi `DynamicRayCastVehicleController` ve dört wheel kullanımı korundu. +Y up, +Z forward, wheel axle -X. Gameplay LEFT negative / RIGHT positive; mevcut doğrulanmış Rapier adapter'ı değiştirilmedi. Gerçek sol/sağ yaw, brake/reverse ve enter/safe-exit regression testleri geçti.

| Parametre | Son değer |
|---|---|
| Mass / chassis | 1200 kg / 1.85 × .65 × 4.2 m cuboid |
| Mass center | Alçak chassis origin; yapay yere yapıştırma yok |
| Wheel / wheelbase / track | .36 / 2.5 / 1.5 m |
| Suspension rest / stiffness | .38 m / 26 |
| Compression / relaxation damping | 3.2 / 3.2 |
| Body linear / angular damping | .25 / 1.8 |
| Grip / rear handbrake grip | 1.8 / .65 |
| Engine / reverse force | 1900 / 900, her arka teker için |
| Brake | 34, teker başına |
| Forward / reverse cap | 31 / 10 m/s |
| Steer limit / high-speed reduction / response | .48 rad / .62 / 4.5 |

Speed cap son 1 m/s aralığında force'u azaltır; her frame velocity overwrite etmez. Visual chassis origin collider center'a hizalandı, teker merkezleri Rapier suspension length kullanır. Full quaternion slope orientation, spin ve front steering korunur.

Gerçek %6 eğim testinde peak 10.045 m/s, max yaw rate .803 rad/s, minimum up-Y .9966; altı alternating turn, handbrake, reverse, duvar collision ve dispose geçti. Bu fixture 31 m/s cap'e ulaşıldığını kanıtlamaz; mevcut drag nedeniyle terminal hız daha düşüktür.

## AI traffic

Eski activation yalnız lane point + terrain yüksekliği kullanıyordu; lane'in render/physics chunk'ı yüklü mü, tekerler gerçek ground buluyor mu, gövde bina/araçla çakışıyor mu kontrol edilmiyordu. Şimdi:

1. Valid loaded lane, uçlardan 12 m uzaklık ve lane-aligned heading.
2. Dört wheel noktasında finite terrain sample + gerçek Rapier ground ray; beklenen yüzeyle .3 m agreement, grade ≤.18.
3. Yaw uygulanmış, clearance paylı chassis shape overlap query; player/traffic güvenlik mesafesi.
4. Suspension/chassis boyutlarından spawn yüksekliği; ilk .35 s ve en az iki temas olmadan throttle yok.
5. Başarısız activation exponential retry backoff (.1–1 s); frame başına budget 2.

120 candidate stress: 108 güvenli kabul, 12 blocker reddi; kabul edilen off-road/building-overlap/invalid heading/void sayısı 0. NaN, occupied ve void senaryoları ayrıca reddedilir.

Eski spin nedenleri: hedefin outgoing lane'e erken/sert atlaması; `.98` progress'te `advanceRoute(...,0)` çağrılırken içeride `>=1` beklenmesi; dolayısıyla lane geçişinin gecikip hedefin arkada kalması. Recovery aktif chassis'i ışınlayıp aynı döngüyü tekrar başlatıyordu.

Şimdi lane tangent → cubic turn → outgoing tangent sürekli path kullanılır; progress gerçek chassis projection'dır. Pure pursuit look-ahead `6 + speed*.5` m; turn speed 3.5 m/s, hız bağımlı steer limit + exponential response. Hedef arkadaysa gaz/direksiyonla daire çizmek yerine frenlenir.

Following: oriented spatial neighbor query, chassis length + 8 m gap, 1.15 s time headway ve 3 m/s² braking-distance hesabı. Throttle/brake gains .24/.5. Road class speed metadata ve .90–1.05 deterministic variation korunur.

Reservation: yaklaşımda 30 m içinde talep, 9 m stop offset, FIFO queue, 15 s sınırlı lease. Sürekli request lease'i sonsuza uzatmaz. Route exit/deactivate/dispose queue ve lease temizler.

Recovery: poor progress + yaw rate, low speed, behind-target, flip veya lateral error kontrolü. 2 s brake/settle ardından yalnız yakın, bağlı ve ileri bakan current/outgoing lane'e bir rejoin denemesi. Tekrar başarısızsa oyuncu yanındayken frenli kalır; >64 m uzakta ve timeout sonrası deactivate/recycle edilir. Aktif body teleport edilmez. Statik engel testinde recovery en fazla iki kez, bir activation/controller, zero spin; sonsuz reset döngüsü yoktur. Genel engel etrafı yeni pathfinding eklenmedi.

İki dakika gerçek sekiz-car stress: peak 8, final 4 active +28 background, 20 activation/16 deactivation, 12 retained route transition, **0 spin, 0 recovery**. Continuous driving path'ten maksimum sapma 2.084 m; 3 m off-path eşiğini aşan örnek 0. Bu eşik lane genişliği değil, junction curve dahil controller stress toleransıdır. Nüfus sabit sekiz olmak zorunda değildir; unsafe activation ertelenir. Dört yönlü kavşak testinde dört incoming aracın tamamı ilerledi, waiting gözlendi, minimum center gap 4.000 m, pile-up/deadlock yok. Sol/sağ gerçek turn testinde yaw ±1.570764 rad ve x ±88.142 m; outgoing lane geçişi doğrulandı.

## 20+ chunk gerçek fizik traversal / return

Test sürücüsü yalnız wheel force, brake ve steering yazar; body transform/velocity teleport etmez. Traffic ve NPC açıktır. Yolun doğru tarafında ilerler, dönüşte diğer tarafta reverse kullanır ve öndeki traffic için frenler. İlk centerline test sürücüsü dönüşte bir collision sonrası kalmıştı; bu başarısız deneme gizlenmedi ve traffic collision kapatılarak çözülmedi.

Son koşu: z=20 → 2589.260 → 29.859, **20.072 chunk ileri ve geri**. Minimum terrain–chassis center clearance .9646 m. Return road/lane/pedestrian network ve building JSON başlangıçla aynı. Runtime traffic konumlarının resetlenmesi beklenmez.

| Kaynak | Peak | Final |
|---|---:|---:|
| Terrain chunk | 30 | 30 |
| Road view | 30 | 30 |
| Building view | 22 | 19 |
| Building collider | 27 | 24 |
| Lane runtime | 372 | 318 |
| Pedestrian node runtime | 386 | 346 |
| NPC active/rendered | 20 | 20 |
| NPC background | 166 | 156 |
| Traffic active/rendered | 8 | 8 |
| Traffic background | 32 | 24 |
| Physics body | 66 | 63 |
| Collider | 66 | 63 |
| Vehicle controller, player dahil | 9 | 9 |
| Scene root children | 200 | 197 |

Traffic 138 activation /130 deactivation, 982 unsafe attempt reddi, 1 recovery, 0 sustained spin. Dispose sonrası **body=0, collider=0, vehicle controller=0, scene children=0**. Ziyaret mesafesiyle sınırsız kaynak artışı saptanmadı. GPU draw/triangle sayısı headless physics traversal'da ölçülmez; ayrı gerçek browser gözlemi aşağıdadır.

## Browser / performance / manuel sınır

Codex browser playtest: gerçek şehirde junction, crosswalk, NPC feet/corners ve real-physics traffic görsel olarak incelendi. Bağımsız QA fixture'da yaklaşık 94–120 FPS, görüşe göre 71–158 draw call ve 20.7k–37.1k triangle gözlendi. Main gameplay 76–105 FPS, yaklaşık 87–107 draw call /17.5k–18k triangle; tüm debug'lar açıkken yaklaşık 123 draw /21.3k triangle. Bunlar kısa sahne örnekleridir, garanti veya traversal GPU peak'i değildir.

Main canvas'ta jump/landing, third-person/development geçişi, F3 göster/gizle ve F4–F8 toggles çalıştı. Street-layer render, dört ayrılmış zebra bandı, NPC grounding ve traffic wheel/chassis görüntüsü kontrol edildi. Konsolda incelenen warn/error listeleri boştu. Sustained-key ve pointer-lock mouse orbit otomasyonu tam manuel sürüş eşdeğeri sayılmadı; physics/input/steering/camera-filter integration testleri esas kanıttır.

Kalan kısa manuel kontrol: canvas click + mouse orbit; WASD/Shift ile eğim/curb ve 10 tekrar jump; E ile bin, A/D, fren/reverse/Space, E ile güvenli çık. F2 dönüşte doğru gameplay kameraya gelmeli.

Production JS 3,468.64 kB (gzip 1,238.94 kB). Mevcut Rapier large-chunk warning devam ediyor; paket, chunk splitting veya warning eşiğiyle oynanmadı.

## Remaining physics risks

- Sınırlı test penceresi tüm seed'leri doğrulamaz. Aşırı terrain grade'de generator artık açık hata verir; otomatik road rerouting yoktur.
- Arbitrary player obstruction için traffic obstacle-around planner yoktur. Güvenli brake/tek retry/uzakta recycle davranışı oyuncu yanında bekleyen bir araç bırakabilir; pop-in teleport tercih edilmedi.
- Raycast camera, hacimsel camera collision değildir; çok ince köşeler ve aşırı ani hareketler manuel sınır testine açıktır.
- 31 m/s maxForwardSpeed bir cap'tir, mevcut sedan'ın gerçek ulaşılan terminal hızı değildir. Yüksek hızlı otoyol veya ağır çarpışma simülasyonu sertifikalandırılmadı.
- NPC smoothing dar graph corridor içinde sınırlıdır; dense-crowd avoidance tam fiziksel kalabalık çözücüsü değildir.
- FPS/görsel rahatlık için farklı cihazlarda pointer-lock ve uzun sürüş manuel testine ihtiyaç devam eder. Ölçülen bounded ownership, tam heap/GPU profiler analizi yerine sanity check'tir.

Three.js runtime ve game-playtest skill yaklaşımı; simulation/render ayrımının, gerçek screenshot kontrolünün ve başarısız testlerin gizlenmeden regression olarak korunmasının uygulanmasına yön verdi.
