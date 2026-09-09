# Open World Game — Engine Foundation

Browser tabanlı, uzun vadeli bir 3D açık dünya oyunu için Aşama 1 motor temelidir. Bu aşama yalnızca motor sınırlarını ve doğrulama dünyasını içerir; oyuncu, şehir, NPC, araç, görev ve kalıcılık sistemleri henüz yoktur.

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

`npm run dev` komutundan sonra Vite'ın gösterdiği yerel URL'yi açın. Sağ fare tuşuyla sürükleyerek development kamerasını hareket ettirebilir, F3 ile geliştirme HUD'unu açıp kapatabilirsiniz.

## Klasör yapısı

```text
src/
  core/          # Game lifecycle, zaman ve fixed-step loop
  simulation/    # Serializable, render'dan bağımsız world/entity state
  physics/       # Rapier başlatma ve render senkronizasyon adaptörü
  render/        # Renderer, sahne ve development kamera
  input/         # Physical input -> semantic game action eşlemesi
  world/         # Sadece doğrulama amaçlı test sahnesi
  ui/            # DOM HUD ve hata ekranı
  diagnostics/   # FPS, frame-time ve render sayaçları
```

## Mimari ilkeler

- Simulation state, Three.js nesnelerinden bağımsızdır ve serileştirilebilir.
- Three.js yalnızca görünüm katmanıdır; mesh/body eşlemesi `PhysicsRenderSynchronizer` üzerinden yapılır.
- Rapier fixed timestep ile çalışır; render döngüsü requestAnimationFrame tabanlıdır.
- Physical input tek bir `InputManager` içinde semantic action'lara dönüştürülür.
- HUD ve hata durumu WebGL canvas'ı yerine DOM ile çizilir.

## Geleceğe hazırlık

WorldState; seed, entity ve region durumlarını şimdiden tutar. Render/simulation ayrımı; ileride chunk streaming, LOD, instancing, object pooling, spatial indexing, worker'lar, glTF/GLB, Draco/Meshopt ve KTX2 eklenmesine elverişlidir. Bu sistemler bu aşamada uygulanmamıştır.
