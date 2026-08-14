const assetUrl = relative => new URL(relative, import.meta.url).href;

const SCRIPT_URLS = [
  assetUrl('../../vendor/recognition/opencv.js'),
  assetUrl('../../vendor/recognition/tf.min.js'),
  assetUrl('../../vendor/recognition/mobilenet.min.js'),
  assetUrl('./quantity-templates.js'),
  assetUrl('./hayday-recognizer.js')
];

const MODEL_URLS = [
  assetUrl('../../assets/recognition/model/mobilenet-v2-model.json'),
  assetUrl('../../assets/recognition/model/group1-shard1of2.bin'),
  assetUrl('../../assets/recognition/model/group1-shard2of2.bin')
];

let enginePromise;
let configuredFingerprint = '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-recognition-src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.dataset.recognitionSrc = src;
    script.src = src;
    script.async = false;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${src}.`)), { once: true });
    if (!existing) document.head.append(script);
  });
}

async function fetchFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar ${url}.`);
  const blob = await response.blob();
  return new File([blob], url.split('/').pop(), { type: blob.type, lastModified: 0 });
}

function recognitionCatalog(items) {
  return items.map(item => ({
    id: Number(item.dbId),
    slug: item.id,
    name_original: item.nameEn || item.namePt || item.id,
    level: Number(item.unlockLevel)
  }));
}

function iconMap(items) {
  return new Map(items.map(item => [
    `${item.id}.png`,
    assetUrl(`../../assets/icons/${encodeURIComponent(item.id)}.png`)
  ]));
}

export function loadRecognitionEngine(items, onProgress = () => {}) {
  if (!enginePromise) {
    enginePromise = (async () => {
      onProgress('Carregando o motor local pela primeira vez…');
      for (const src of SCRIPT_URLS) await loadScript(src);
      const models = await Promise.all(MODEL_URLS.map(fetchFile));
      return { engine: globalThis.HayDayRecognizer, models };
    })().catch(error => {
      enginePromise = null;
      throw error;
    });
  }

  return enginePromise.then(async ({ engine, models }) => {
    if (!engine) throw new Error('O motor local não foi inicializado.');
    const catalog = recognitionCatalog(items);
    if (catalog.length !== 374) throw new Error(`O reconhecimento exige os 374 itens; o banco retornou ${catalog.length}.`);
    const fingerprint = catalog.map(item => `${item.id}:${item.slug}:${item.level}`).join('|');
    if (fingerprint !== configuredFingerprint) {
      await engine.configureResources({ catalog, icons: iconMap(items), models });
      configuredFingerprint = fingerprint;
    }
    return engine;
  });
}
