/* Hay Day Recognizer v1.0.0 — motor sem interface, derivado da v0.8.0 validada. */
(function(global){
const VERSION="v1.0.0";
const ALGORITHM_VERSION="v0.8.0";
const CATALOG_NAMES=["hayday-items-374.json","hayday-items-374-codigos-letras-v0.4.0.json"];
const BG=[254,248,222];
const TEMPLATE_MAX_DIM=64;
const COARSE_SAMPLE_MAX=48;
const FINE_SAMPLE_MAX=240;
const FINE_CANDIDATES=24;
const COLOR_CANDIDATES=12;
const EMBEDDING_CANDIDATES=36;
const EMBEDDING_SIZE=96;
const TIGHT_SIZE=224;
const TIGHT_OVERRIDE_GAP=8;
const BASELINE_UNCERTAIN_GAP=6;
const MEMORY_AUTO_SIMILARITY=96;
const MEMORY_AUTO_MARGIN=2;
const CLASSIC_WEIGHT=.58;
const EMBEDDING_WEIGHT=.42;
const TOP_K=5;
const FAST_CANDIDATES=48;
const FAST_AGREEMENT_MIN_GAP=3;
// Pares observados nos relatórios anteriores. São apenas candidatos extras:
// não forçam uma resposta e permitem que o OpenCV faça o desempate normal.
const LEGACY_CONFUSION_NAMES=[["Lemon Cake","Rustic Bouquet"],["Mushroom Soup","Lamb Soup"],["Rice Noodles","Land Deed"],["Rice Noodles","Saw"],["Bacon Pie","Lamb Chop"],["Top Hat","Iron Bracelet"],["Bacon and Eggs","Bacon"],["Soothing Pad","Iron Ore"],["Shovel","Milk"]];
const QUANTITY_W=24,QUANTITY_H=36;
// Assinaturas binárias de algarismos do próprio Hay Day, extraídas dos prints de
// calibração e reduzidas a quatro variações por dígito. Não há OCR externo.
const QUANTITY_TEMPLATE_RAW=global.HayDayQuantityTemplates;
if(!Array.isArray(QUANTITY_TEMPLATE_RAW))throw new Error("Carregue quantity-templates.js antes do motor.");
const COARSE_HEIGHT_RATIOS=[.44,.50,.56,.62,.68,.74,.80,.86,.92];
let rootHandle=null,catalog=[],activeCatalog=[],templates=[],preparedLevel=null,iconFiles=new Map(),modelFiles=new Map(),shotFile=null,shotImage=null,latest=null,latestRuns=[],visualMemory=[],confusionHistory=[];
let cvReady=false,visualModel=null,embeddingSize=0,farmName="Farm",farmLevel=1,onProgress=()=>{},running=false;
const progressEl={max:1,value:0};

function status(text,type=""){onProgress({message:text,type,progress:progressEl.value,max:progressEl.max})}
function stem(name){return String(name).replace(/\.[^.]+$/,'').toLowerCase()}
const yieldQueue=[],yieldChannel=typeof MessageChannel!=="undefined"?new MessageChannel():null;if(yieldChannel)yieldChannel.port1.onmessage=()=>yieldQueue.shift()?.();
function yieldFrame(){return new Promise(r=>{if(yieldChannel){yieldQueue.push(r);yieldChannel.port2.postMessage(0)}else setTimeout(r,0)})}
function fmtMs(ms){return (ms/1000).toFixed(1).replace(".",",")+" s"}
function median(values){const a=[...values].sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
async function ensureOpenCv(){if(cvReady)return;if(typeof cv==="undefined")throw new Error("OpenCV.js local não foi carregado.");if(cv instanceof Promise)cv=await cv;cvReady=true}
function modelFile(name){for(const [n,f] of modelFiles)if(n.toLowerCase()===name.toLowerCase())return f;return null}
async function ensureVisualModel(){
  if(visualModel)return;
  if(typeof tf==="undefined"||typeof mobilenet==="undefined")throw new Error("TensorFlow.js ou MobileNet local não foi carregado.");
  const files=[modelFile("mobilenet-v2-model.json"),modelFile("group1-shard1of2.bin"),modelFile("group1-shard2of2.bin")];
  if(files.some(x=>!x))throw new Error("Faltam os três arquivos locais do modelo MobileNet na pasta libs.");
  status("Inicializando a rede visual local…","run");await tf.ready();
  visualModel=await mobilenet.load({version:2,alpha:.5,modelUrl:tf.io.browserFiles(files),inputRange:[0,1]});
}
async function embeddingBatch(canvases){
  if(!canvases.length)return[];
  const input=tf.tidy(()=>tf.stack(canvases.map(c=>tf.browser.fromPixels(c))));
  const output=visualModel.infer(input,true),shape=output.shape,data=await output.data();
  input.dispose();output.dispose();const dims=shape[shape.length-1];embeddingSize=dims;
  const rows=[];for(let r=0;r<canvases.length;r++){const v=new Float32Array(dims);let norm=0;for(let j=0;j<dims;j++){const x=data[r*dims+j];v[j]=x;norm+=x*x}norm=Math.sqrt(norm)||1;for(let j=0;j<dims;j++)v[j]/=norm;rows.push(v)}
  return rows;
}
function cosineDistance(a,b){let dot=0;for(let i=0;i<a.length;i++)dot+=a[i]*b[i];return(1-clamp(dot,-1,1))*100}
function cvGradient(canvas){
  const src=cv.imread(canvas),gray=new cv.Mat(),gx=new cv.Mat(),gy=new cv.Mat(),mag=new cv.Mat(),out=new cv.Mat();
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.Sobel(gray,gx,cv.CV_32F,1,0,3);cv.Sobel(gray,gy,cv.CV_32F,0,1,3);cv.magnitude(gx,gy,mag);cv.normalize(mag,out,0,255,cv.NORM_MINMAX,cv.CV_8U);
  src.delete();gray.delete();gx.delete();gy.delete();mag.delete();return out;
}
function disposeTemplates(){for(const t of templates){try{t.cvGradient?.delete();t.cvMask?.delete()}catch{}}templates=[]}

function openDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open("hayday-local-recognition",3);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains("handles"))q.result.createObjectStore("handles");if(!q.result.objectStoreNames.contains("visualMemory"))q.result.createObjectStore("visualMemory",{keyPath:"key"});if(!q.result.objectStoreNames.contains("confusionHistory"))q.result.createObjectStore("confusionHistory",{keyPath:"key"});if(!q.result.objectStoreNames.contains("embeddingCache"))q.result.createObjectStore("embeddingCache",{keyPath:"key"})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function saveHandle(h){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction("handles","readwrite");tx.objectStore("handles").put(h,"root");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function getHandle(){const db=await openDb();const value=await new Promise((resolve,reject)=>{const q=db.transaction("handles").objectStore("handles").get("root");q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error)});db.close();return value}
async function loadLearningMemory(){const db=await openDb();visualMemory=await new Promise((resolve,reject)=>{const q=db.transaction("visualMemory").objectStore("visualMemory").getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)});confusionHistory=await new Promise((resolve,reject)=>{const q=db.transaction("confusionHistory").objectStore("confusionHistory").getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)});db.close();const legacy=visualMemory.filter(row=>Object.hasOwn(row,"code")||Object.hasOwn(row,"codigo_ref"));if(legacy.length){visualMemory=visualMemory.map(row=>{const {code,codigo_ref,...clean}=row;return clean});const migrated=await openDb();await new Promise((resolve,reject)=>{const tx=migrated.transaction("visualMemory","readwrite"),store=tx.objectStore("visualMemory");for(const row of visualMemory)store.put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});migrated.close()}const keep=[],remove=[];for(const row of visualMemory){if(keep.some(x=>Number(x.itemId)===Number(row.itemId)&&signatureSimilarity(x.signature,row.signature)>=99.5))remove.push(row);else keep.push(row)}if(remove.length){const clean=await openDb();await new Promise((resolve,reject)=>{const tx=clean.transaction("visualMemory","readwrite"),store=tx.objectStore("visualMemory");for(const row of remove)store.delete(row.key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});clean.close();visualMemory=keep}}
async function saveVisualExample(d,item){
  if(!d.memorySignature||!item)return false;const duplicate=visualMemory.filter(x=>Number(x.itemId)===Number(item.id)).some(x=>signatureSimilarity(d.memorySignature,x.signature)>=99.5);if(duplicate)return false;const key=`${item.id}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,row={key,itemId:Number(item.id),slug:item.slug,name:item.name||item.name_original,signature:d.memorySignature,createdAt:new Date().toISOString(),farmLevel:Number(farmLevel)||null,source:"human_correction"};
  const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction("visualMemory","readwrite");tx.objectStore("visualMemory").put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();visualMemory.push(row);
  const same=visualMemory.filter(x=>Number(x.itemId)===Number(item.id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),remove=same.slice(5);if(remove.length){const clean=await openDb();await new Promise((resolve,reject)=>{const tx=clean.transaction("visualMemory","readwrite"),store=tx.objectStore("visualMemory");for(const old of remove)store.delete(old.key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});clean.close();const gone=new Set(remove.map(x=>x.key));visualMemory=visualMemory.filter(x=>!gone.has(x.key))}
  return true;
}
function serializableMemoryRow(row){const {code,codigo_ref,...clean}=row;return{...clean,signature:Array.from(row.signature||[])}}
function validateLearningData(data){if(!data||typeof data!=="object")throw new Error("Memória inválida.");if(!Array.isArray(data.visualMemory)||!Array.isArray(data.confusionHistory))throw new Error("A memória precisa conter visualMemory e confusionHistory.")}
async function exportLearningData(){await loadLearningMemory();return{schemaVersion:1,exportedAt:new Date().toISOString(),database:"hayday-local-recognition",visualMemory:visualMemory.map(serializableMemoryRow),confusionHistory:confusionHistory.map(row=>({...row}))}}
async function importLearningData(data,options={}){
  validateLearningData(data);const replace=options.replace===true,rows=data.visualMemory.map(row=>{const {code,codigo_ref,...clean}=row;return{...clean,itemId:Number(row.itemId),signature:Uint8Array.from(row.signature||[])}}),confusions=data.confusionHistory.map(row=>({...row,wrongId:Number(row.wrongId),correctId:Number(row.correctId),count:Number(row.count)||1}));
  if(rows.some(row=>!row.key||!Number.isFinite(row.itemId)||!row.signature.length))throw new Error("Exemplo visual inválido na memória importada.");
  if(confusions.some(row=>!row.key||!Number.isFinite(row.wrongId)||!Number.isFinite(row.correctId)))throw new Error("Histórico de confusão inválido na memória importada.");
  const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(["visualMemory","confusionHistory"],"readwrite"),memoryStore=tx.objectStore("visualMemory"),confusionStore=tx.objectStore("confusionHistory");if(replace){memoryStore.clear();confusionStore.clear()}for(const row of rows)memoryStore.put(row);for(const row of confusions)confusionStore.put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();await loadLearningMemory();return getLearningSummary();
}
async function saveConfusions(d,correctItem){
  if(!correctItem)return;const correctId=Number(correctItem.id),wrong=[d.finalPredicted,d.baselinePredicted,d.tightPredicted].filter(Boolean).map(x=>Number(x.id)).filter((id,i,a)=>id!==correctId&&a.indexOf(id)===i);if(!wrong.length)return;
  const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction("confusionHistory","readwrite"),store=tx.objectStore("confusionHistory");for(const wrongId of wrong){const key=`${wrongId}>${correctId}`,old=confusionHistory.find(x=>x.key===key),row={key,wrongId,correctId,count:(old?.count||0)+1,updatedAt:new Date().toISOString()};store.put(row);if(old)Object.assign(old,row);else confusionHistory.push(row)}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
}
function confusionCandidateIds(seedIds){const seeds=new Set(seedIds.map(Number)),out=new Set();for(const row of confusionHistory)if(seeds.has(Number(row.wrongId))||seeds.has(Number(row.correctId))){out.add(Number(row.wrongId));out.add(Number(row.correctId))}for(const pair of LEGACY_CONFUSION_NAMES){const items=pair.map(name=>activeCatalog.find(x=>(x.name_original||x.name)===name)).filter(Boolean);if(items.some(x=>seeds.has(Number(x.id))))for(const x of items)out.add(Number(x.id))}return out}
async function permission(h,request){const o={mode:"read"};if(await h.queryPermission(o)==="granted")return true;return request&&(await h.requestPermission(o)==="granted")}
async function findDir(root,name){try{return await root.getDirectoryHandle(name)}catch{}for await(const [n,h] of root.entries())if(h.kind==="directory"&&n.toLowerCase()===name.toLowerCase())return h;return null}
async function findFile(root,name){for await(const [n,h] of root.entries())if(h.kind==="file"&&n.toLowerCase()===name.toLowerCase())return h.getFile();return null}
async function collectFiles(dir){const m=new Map();for await(const [,h] of dir.entries())if(h.kind==="file"){const f=await h.getFile();m.set(f.name,f)}return m}

async function loadRoot(handle,request=false){
  if(!await permission(handle,request))throw new Error("Acesso à pasta não autorizado.");
  status("Lendo catálogo, ícones e bibliotecas…","run");
  const iconDir=await findDir(handle,"icones"),libsDir=await findDir(handle,"libs");let catalogFile=null;for(const name of CATALOG_NAMES){catalogFile=await findFile(handle,name);if(catalogFile)break}
  if(!iconDir||!libsDir||!catalogFile)throw new Error("Falta a pasta icones, a pasta libs ou o catálogo esperado.");
  const parsed=JSON.parse(await catalogFile.text());
  await setResources({catalog:parsed,icons:await collectFiles(iconDir),models:await collectFiles(libsDir)});
  rootHandle=handle;
  return resourceSummary();
}
function selectedFarmLevel(){return clamp(Math.round(Number(farmLevel)||0),1,300)}
function fileForSlug(slug){for(const [name,file] of iconFiles)if(stem(name)===slug)return file;return null}
function imageFromBlob(source){return new Promise((resolve,reject)=>{const remote=typeof source==="string",url=remote?source:URL.createObjectURL(source),img=new Image();img.onload=()=>{if(!remote)URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{if(!remote)URL.revokeObjectURL(url);reject(new Error("Imagem inválida: "+(remote?url:source.name)))};img.src=url})}
function alphaBounds(img){
  const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
  const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
  for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){if(d[(y*c.width+xx)*4+3]>8){if(xx<minX)minX=xx;if(y<minY)minY=y;if(xx>maxX)maxX=xx;if(y>maxY)maxY=y}}
  return maxX<0?{x:0,y:0,w:c.width,h:c.height}:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}
function buildTemplate(img,item){
  const b=alphaBounds(img),aspect=b.w/Math.max(1,b.h);
  const tw=aspect>=1?TEMPLATE_MAX_DIM:Math.max(8,Math.round(TEMPLATE_MAX_DIM*aspect));
  const th=aspect>=1?Math.max(8,Math.round(TEMPLATE_MAX_DIM/aspect)):TEMPLATE_MAX_DIM;
  const canvas=document.createElement("canvas");canvas.width=tw;canvas.height=th;
  const cx=canvas.getContext("2d",{willReadFrequently:true});cx.clearRect(0,0,tw,th);cx.drawImage(img,b.x,b.y,b.w,b.h,0,0,tw,th);
  const raw=cx.getImageData(0,0,tw,th).data,points=[],edges=[],alphaMap=new Float32Array(tw*th),maskDilated=new Uint8Array(tw*th);
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
    const i=(y*tw+x)*4,a=raw[i+3]/255;alphaMap[y*tw+x]=a;if(a<.08)continue;
    points.push({u:(x+.5)/tw,v:(y+.5)/th,r:raw[i],g:raw[i+1],b:raw[i+2],a});
  }
  // Pontos da silhueta externa. Guardamos uma direção aproximada para fora da arte.
  // Na hora do match, um pouco ALÉM desta borda deveria voltar ao bege. Se ainda houver
  // pixels fortes do item ali, o template está pequeno/desalinhado e recebe penalidade.
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
    const a=alphaMap[y*tw+x];if(a<.28)continue;
    let nx=0,ny=0,nout=0;
    for(const [dx,dy] of dirs){const xx=x+dx,yy=y+dy,oa=(xx<0||yy<0||xx>=tw||yy>=th)?0:alphaMap[yy*tw+xx];if(oa<.10){nx+=dx;ny+=dy;nout++}}
    if(!nout)continue;
    const len=Math.hypot(nx,ny)||1;
    edges.push({u:(x+.5)/tw,v:(y+.5)/th,nx:nx/len,ny:ny/len,a});
  }
  // Máscara levemente dilatada: tolera anti-aliasing/redimensionamento sem permitir
  // que um template explique apenas uma pequena ilha de pixels do objeto real.
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
    let on=0;for(let yy=Math.max(0,y-2);yy<=Math.min(th-1,y+2)&&!on;yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(tw-1,x+2);xx++)if(alphaMap[yy*tw+xx]>.10){on=1;break}
    maskDilated[y*tw+x]=on;
  }
  function sparseFrom(arr,limit){
    if(arr.length<=limit)return arr.slice();
    const out=[],step=arr.length/limit;
    for(let k=0;k<limit;k++)out.push(arr[Math.min(arr.length-1,Math.floor((k+.5)*step))]);
    return out;
  }
  const maskBytes=new Uint8Array(tw*th);for(let i=0;i<maskBytes.length;i++)maskBytes[i]=alphaMap[i]>.10?255:0;
  return{id:Number(item.id),slug:item.slug,name:item.name_original,aspect,
    coarse:sparseFrom(points,COARSE_SAMPLE_MAX),fine:sparseFrom(points,FINE_SAMPLE_MAX),
    edgeCoarse:sparseFrom(edges,Math.min(36,COARSE_SAMPLE_MAX)),edgeFine:sparseFrom(edges,Math.min(150,FINE_SAMPLE_MAX)),
    alphaMap,maskDilated,maskW:tw,maskH:th,cvGradient:cvGradient(canvas),cvMask:cv.matFromArray(th,tw,cv.CV_8UC1,maskBytes),
    preview:canvas,sourceBounds:b,sourceSize:{w:img.naturalWidth,h:img.naturalHeight}};
}
async function prepareTemplates(){
  const level=selectedFarmLevel();activeCatalog=catalog.filter(item=>Number(item.level)<=level);if(!activeCatalog.length)throw new Error(`Nenhum item disponível no nível ${level}.`);
  templates=[];progressEl.max=activeCatalog.length;progressEl.value=0;
  for(let i=0;i<activeCatalog.length;i++){
    const img=await imageFromBlob(fileForSlug(activeCatalog[i].slug));templates.push(buildTemplate(img,activeCatalog[i]));progressEl.value=i+1;
    if(i%12===0){status(`Nível ${level}: preparando ${i+1}/${activeCatalog.length} PNGs disponíveis…`,"run");await yieldFrame()}
  }
  preparedLevel=level;
}
function visualFrame(size=EMBEDDING_SIZE){const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle=`rgb(${BG.join(",")})`;x.fillRect(0,0,c.width,c.height);return c}
function templateVisualCanvas(t){
  const c=visualFrame(),x=c.getContext("2d"),pad=8,box=EMBEDDING_SIZE-pad*2;
  let w=box,h=box;if(t.aspect>=1)h=box/t.aspect;else w=box*t.aspect;
  x.drawImage(t.preview,(EMBEDDING_SIZE-w)/2,(EMBEDDING_SIZE-h)/2,w,h);return c;
}
function templateTightVisualCanvas(t){
  let minX=t.maskW,minY=t.maskH,maxX=-1,maxY=-1;
  for(let y=0;y<t.maskH;y++)for(let x=0;x<t.maskW;x++)if(t.alphaMap[y*t.maskW+x]>.25){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  if(maxX<0)return templateVisualCanvas(t);const coreW=maxX-minX+1,coreH=maxY-minY+1,pad=Math.ceil(Math.max(coreW,coreH)*.06),sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad),sw=Math.min(t.maskW,maxX+pad+1)-sx,sh=Math.min(t.maskH,maxY+pad+1)-sy;
  const c=visualFrame(TIGHT_SIZE),ctx=c.getContext("2d"),box=TIGHT_SIZE-28;let dw=box,dh=box;if(sw>=sh)dh=box*sh/sw;else dw=box*sw/sh;ctx.drawImage(t.preview,sx,sy,sw,sh,(TIGHT_SIZE-dw)/2,(TIGHT_SIZE-dh)/2,dw,dh);return c;
}
function matchedVisualCanvas(a,t,fit){
  const c=visualFrame(),ctx=c.getContext("2d",{willReadFrequently:true}),out=ctx.getImageData(0,0,EMBEDDING_SIZE,EMBEDDING_SIZE),pad=8,box=EMBEDDING_SIZE-pad*2;
  let rw=box,rh=box;if(t.aspect>=1)rh=box/t.aspect;else rw=box*t.aspect;const rx=(EMBEDDING_SIZE-rw)/2,ry=(EMBEDDING_SIZE-rh)/2;
  for(let y=Math.floor(ry);y<Math.ceil(ry+rh);y++)for(let x=Math.floor(rx);x<Math.ceil(rx+rw);x++){
    const u=(x+.5-rx)/rw,v=(y+.5-ry)/rh;if(u<0||v<0||u>=1||v>=1)continue;
    const tx=Math.min(t.maskW-1,Math.max(0,Math.floor(u*t.maskW))),ty=Math.min(t.maskH-1,Math.max(0,Math.floor(v*t.maskH))),alpha=t.alphaMap[ty*t.maskW+tx];if(alpha<.08)continue;
    const sx=Math.min(a.w-1,Math.max(0,Math.round(fit.x+u*fit.w))),sy=Math.min(a.h-1,Math.max(0,Math.round(fit.y+v*fit.h))),si=(sy*a.w+sx)*4,di=(y*EMBEDDING_SIZE+x)*4;
    out.data[di]=a.data[si];out.data[di+1]=a.data[si+1];out.data[di+2]=a.data[si+2];out.data[di+3]=255;
  }
  ctx.putImageData(out,0,0);return c;
}
async function prepareTemplateEmbeddings(){
  if(templates.every(t=>t.embedding&&t.tightEmbedding))return;await ensureVisualModel();const db=await openDb(),cached=await new Promise((resolve,reject)=>{const q=db.transaction("embeddingCache").objectStore("embeddingCache").getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)});db.close();const cache=new Map(cached.map(x=>[x.key,x]));
  for(const t of templates){const f=fileForSlug(t.slug),key=`mnet-v2-a05:${t.slug}:${f?.size||0}:${f?.lastModified||0}`,hit=cache.get(key);t.embeddingCacheKey=key;if(hit?.embedding&&hit?.tightEmbedding){t.embedding=new Float32Array(hit.embedding);t.tightEmbedding=new Float32Array(hit.tightEmbedding)}}
  const missing=templates.filter(t=>!t.embedding||!t.tightEmbedding),batch=16;progressEl.max=Math.max(1,missing.length);progressEl.value=0;
  for(let i=0;i<missing.length;i+=batch){const part=missing.slice(i,i+batch),rows=await embeddingBatch(part.map(templateVisualCanvas)),tightRows=await embeddingBatch(part.map(templateTightVisualCanvas)),save=await openDb();for(let j=0;j<part.length;j++){part[j].embedding=rows[j];part[j].tightEmbedding=tightRows[j]}await new Promise((resolve,reject)=>{const tx=save.transaction("embeddingCache","readwrite"),store=tx.objectStore("embeddingCache");for(const t of part)store.put({key:t.embeddingCacheKey,embedding:t.embedding,tightEmbedding:t.tightEmbedding,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});save.close();progressEl.value=Math.min(missing.length,i+part.length);status(`Criando e guardando assinaturas novas: ${Math.min(missing.length,i+part.length)}/${missing.length}…`,"run");await yieldFrame()}
  if(!missing.length)status(`Assinaturas dos ${templates.length} PNGs recuperadas do cache local.`,"run");
}

function contiguousIntervals(values,threshold){const out=[];let start=-1;for(let i=0;i<values.length;i++){const on=values[i]>threshold;if(on&&start<0)start=i;if((!on||i===values.length-1)&&start>=0){const end=on&&i===values.length-1?i:i-1;out.push({start,end,len:end-start+1});start=-1}}return out}
function smooth(values,w){w=Math.max(1,Math.round(w));const out=new Float64Array(values.length),prefix=new Float64Array(values.length+1);for(let i=0;i<values.length;i++)prefix[i+1]=prefix[i]+values[i];const half=Math.floor(w/2);for(let i=0;i<values.length;i++){const a=Math.max(0,i-half),b=Math.min(values.length,i+half+1);out[i]=(prefix[b]-prefix[a])/(b-a)}return out}
function estimatePeriod(signal,minLag,maxLag){const n=signal.length,mean=signal.reduce((a,b)=>a+b,0)/n;let bestLag=Math.round((minLag+maxLag)/2),best=-Infinity;minLag=Math.max(3,Math.round(minLag));maxLag=Math.min(n-3,Math.round(maxLag));for(let lag=minLag;lag<=maxLag;lag++){let num=0,da=0,db=0;for(let i=0;i<n-lag;i++){const a=signal[i]-mean,b=signal[i+lag]-mean;num+=a*b;da+=a*a;db+=b*b}const corr=num/Math.sqrt(Math.max(1e-9,da*db));if(corr>best){best=corr;bestLag=lag}}return{period:bestLag,corr:best}}
function regularPeaks(signal,period){const local=[];for(let i=1;i<signal.length-1;i++)if(signal[i]>=signal[i-1]&&signal[i]>=signal[i+1])local.push({i,v:signal[i]});const vals=[...signal].sort((a,b)=>a-b),threshold=vals[Math.floor(vals.length*.58)]||0;local.sort((a,b)=>b.v-a.v);const picked=[],minDist=Math.max(6,period*.58);for(const p of local){if(p.v<threshold)continue;if(picked.every(x=>Math.abs(x.i-p.i)>=minDist))picked.push(p)}picked.sort((a,b)=>a.i-b.i);if(picked.length<2)return picked.map(x=>x.i);const diffs=[];for(let i=1;i<picked.length;i++)diffs.push(picked[i].i-picked[i-1].i);const md=median(diffs.filter(d=>d>period*.45&&d<period*1.55))||period;return picked.filter((p,idx)=>{const left=idx?Math.abs((p.i-picked[idx-1].i)-md):Infinity,right=idx<picked.length-1?Math.abs((picked[idx+1].i-p.i)-md):Infinity;return Math.min(left,right)<md*.48||picked.length<=3}).map(x=>x.i)}
function quantile(values,q){const a=[...values].sort((x,y)=>x-y);if(!a.length)return 0;const pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);if(lo===hi)return a[lo];const t=pos-lo;return a[lo]*(1-t)+a[hi]*t}
function lowRuns(signal,start,end,threshold,minLen){
  start=clamp(Math.floor(start),0,signal.length-1);end=clamp(Math.ceil(end),start+1,signal.length);
  const out=[];let a=-1;
  for(let i=start;i<end;i++){
    const low=signal[i]<=threshold;
    if(low&&a<0)a=i;
    if(a>=0&&((!low)||i===end-1)){
      const b=low&&i===end-1?i:i-1;
      if(b-a+1>=minLen)out.push({start:a,end:b,len:b-a+1,mean:(()=>{let s=0;for(let j=a;j<=b;j++)s+=signal[j];return s/(b-a+1)})()});
      a=-1;
    }
  }
  return out;
}
function gutterBoundary(signal,leftCenter,rightCenter){
  const span=rightCenter-leftCenter,mid=(leftCenter+rightCenter)/2;
  const a=leftCenter+span*.18,b=rightCenter-span*.18;
  const vals=[];for(let i=Math.max(0,Math.floor(a));i<Math.min(signal.length,Math.ceil(b));i++)vals.push(signal[i]);
  const q20=quantile(vals,.20),q40=quantile(vals,.40);
  const threshold=clamp(Math.max(.012,q20*1.9+0.004,Math.min(q40*.80,.055)),.012,.070);
  let runs=lowRuns(signal,a,b,threshold,Math.max(2,Math.round(span*.018)));
  if(!runs.length){
    const relaxed=clamp(Math.max(.022,q40*1.05),.022,.095);
    runs=lowRuns(signal,a,b,relaxed,Math.max(2,Math.round(span*.012)));
  }
  if(!runs.length)return{boundary:mid,gutter:null,threshold,fallback:true};
  runs.sort((u,v)=>{
    const um=(u.start+u.end+1)/2,vm=(v.start+v.end+1)/2;
    const us=u.len-0.30*Math.abs(um-mid),vs=v.len-0.30*Math.abs(vm-mid);
    return vs-us;
  });
  const g=runs[0];return{boundary:(g.start+g.end+1)/2,gutter:g,threshold,fallback:false};
}
function outerGutterBoundary(signal,center,period,side,panelStart,panelEnd){
  // v0.2.9: a borda do painel pertence à primeira/última linha completa quando
  // ela já está a aproximadamente meia célula do centro. Assim não jogamos fora
  // bege válido só porque existe uma pequena margem livre antes/depois do item.
  // Só procuramos um corte interno quando há espaço maior que ~0,60 célula, o que
  // indica território suficiente para existir resto de uma linha vizinha parcial.
  const dir=side==='top'?-1:1;
  const edgeDistance=dir<0?center-panelStart:panelEnd-center;
  const edgeRatio=period>0?edgeDistance/period:0;
  if(edgeRatio<=.60){
    return{boundary:dir<0?panelStart:panelEnd,gutter:null,threshold:null,fallback:false,mode:'panel-edge',edgeRatio};
  }
  let a,b;
  if(dir<0){a=Math.max(panelStart,center-period*.78);b=Math.max(a+1,center-period*.18)}
  else{a=Math.min(panelEnd-1,center+period*.18);b=Math.min(panelEnd,center+period*.78)}
  const vals=[];for(let i=Math.max(0,Math.floor(a));i<Math.min(signal.length,Math.ceil(b));i++)vals.push(signal[i]);
  const q25=quantile(vals,.25),q45=quantile(vals,.45);
  const threshold=clamp(Math.max(.012,q25*1.8+0.004,Math.min(q45*.80,.060)),.012,.075);
  let runs=lowRuns(signal,a,b,threshold,Math.max(2,Math.round(period*.018)));
  if(!runs.length)runs=lowRuns(signal,a,b,clamp(Math.max(.025,q45*1.05),.025,.10),2);
  if(!runs.length){
    const fallback=clamp(center+dir*period*.50,panelStart,panelEnd);
    return{boundary:fallback,gutter:null,threshold,fallback:true,mode:'half-period',edgeRatio};
  }
  const target=center+dir*period*.50;
  runs.sort((u,v)=>{const um=(u.start+u.end+1)/2,vm=(v.start+v.end+1)/2;const us=u.len-.18*Math.abs(um-target),vs=v.len-.18*Math.abs(vm-target);return vs-us});
  const g=runs[0];
  return{boundary:(g.start+g.end+1)/2,gutter:g,threshold,fallback:false,mode:'outer-gutter',edgeRatio};
}
function isBeige(r,g,b){return r>228&&g>220&&b>170&&(r-b)>12&&(g-b)>7&&Math.abs(r-g)<34}
function detectPanelAndGrid(img){
  const maxW=1100,scale=Math.min(1,maxW/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h).data;
  // v0.2.8: localizar PRIMEIRO a largura do painel bege usando a imagem inteira.
  // Isso evita o erro do tablet: como o celeiro é estreito em relação à tela, medir
  // a quantidade de bege por linha sobre a largura TOTAL fragmentava o painel em faixas.
  const bg=new Uint8Array(w*h),colGlobal=new Float64Array(w);
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=(yy*w+xx)*4,v=isBeige(d[i],d[i+1],d[i+2])?1:0;bg[yy*w+xx]=v;colGlobal[xx]+=v}
  for(let xx=0;xx<w;xx++)colGlobal[xx]/=h;

  // Suavizar também fecha pequenos cortes causados por contornos/antialiasing sem
  // pressupor quantas colunas existem. O maior bloco bege vertical é o painel útil.
  const colGlobalSmooth=smooth(colGlobal,Math.max(5,w*.008));
  let xInts=contiguousIntervals(colGlobalSmooth,.12).filter(o=>o.len>w*.12);
  if(!xInts.length)xInts=contiguousIntervals(colGlobalSmooth,.08).filter(o=>o.len>w*.10);
  if(!xInts.length)throw new Error('Não consegui localizar a largura do painel bege do celeiro.');
  xInts.sort((a,b)=>b.len-a.len);const xi=xInts[0],pw=xi.len;

  // Só AGORA medimos o bege por linha, restrito à largura do próprio celeiro.
  // Assim um painel estreito de tablet e um painel largo de celular usam a mesma lógica.
  const rowLocal=new Float64Array(h);
  for(let yy=0;yy<h;yy++){let n=0;for(let xx=xi.start;xx<=xi.end;xx++)n+=bg[yy*w+xx];rowLocal[yy]=n/pw}
  const rowLocalSmooth=smooth(rowLocal,Math.max(5,h*.010));
  let yInts=contiguousIntervals(rowLocalSmooth,.18).filter(o=>o.len>h*.18);
  if(!yInts.length)yInts=contiguousIntervals(rowLocalSmooth,.12).filter(o=>o.len>h*.14);
  if(!yInts.length)throw new Error('Localizei a largura do celeiro, mas não consegui delimitar sua altura bege.');
  yInts.sort((a,b)=>b.len-a.len);const yi=yInts[0],ph=yi.len;
  const projX=new Float64Array(pw),projY=new Float64Array(ph);
  for(let yy=yi.start;yy<=yi.end;yy++)for(let xx=xi.start;xx<=xi.end;xx++){if(!bg[yy*w+xx]){projX[xx-xi.start]++;projY[yy-yi.start]++}}
  for(let i=0;i<projX.length;i++)projX[i]/=ph;for(let i=0;i<projY.length;i++)projY[i]/=pw;
  const sx=smooth(projX,Math.max(5,pw*.018)),sy=smooth(projY,Math.max(5,ph*.024));
  const xp=estimatePeriod(sx,pw*.16,pw*.34),yp=estimatePeriod(sy,ph*.18,ph*.42);
  let xPeaks=regularPeaks(sx,xp.period),yPeaks=regularPeaks(sy,yp.period);
  if(xPeaks.length<2||yPeaks.length<2)throw new Error(`Grade insuficiente: ${xPeaks.length} coluna(s), ${yPeaks.length} linha(s).`);
  xPeaks=xPeaks.map(v=>v+xi.start);yPeaks=yPeaks.map(v=>v+yi.start);
  const dx=median(xPeaks.slice(1).map((v,i)=>v-xPeaks[i]))||xp.period,dy=median(yPeaks.slice(1).map((v,i)=>v-yPeaks[i]))||yp.period;

  // Horizontal permanece como estava: já funcionou bem nos testes anteriores.
  const slotW=dx*.76;
  const fullX=xPeaks.filter(p=>p-slotW*.50>xi.start+1&&p+slotW*.50<xi.end-1);

  // v0.2.9: vertical não exige mais quase uma célula inteira dentro do painel.
  // O centro já foi aceito pelo detector de periodicidade; aqui só eliminamos picos
  // praticamente colados à borda, típicos de restos de linhas cortadas. Isso mantém,
  // por exemplo, a 5ª linha do tablet, cujo centro estava a ~0,46 célula do fundo.
  const verticalGuard=Math.max(2,dy*.28);
  const fullY=yPeaks.filter(p=>(p-yi.start)>verticalGuard&&((yi.end+1)-p)>verticalGuard);
  if(!fullX.length||!fullY.length)throw new Error('A grade foi localizada, mas nenhuma célula ficou totalmente visível.');

  // As colunas continuam usando toda a largura bege disponível.
  const trimLeft=xi.start,trimRight=xi.end+1;

  // Nas bordas verticais, primeiro damos todo o bege à linha extrema quando o painel
  // termina naturalmente perto de meia célula do seu centro. Só cortamos por dentro
  // quando existe espaço excedente compatível com uma linha parcial vizinha.
  const topCut=outerGutterBoundary(sy,fullY[0]-yi.start,dy,'top',0,ph);
  const bottomCut=outerGutterBoundary(sy,fullY.at(-1)-yi.start,dy,'bottom',0,ph);
  let trimTop=yi.start+topCut.boundary;
  let trimBottom=yi.start+bottomCut.boundary;
  if(trimBottom<=trimTop+Math.max(8,dy*.6)){
    trimTop=yi.start;
    trimBottom=yi.end+1;
  }

  // O ponto-chave desta versão: entre dois centros, não cortamos no meio dos centros.
  // Procuramos a faixa de pixels realmente bege que separa os dois blocos de conteúdo
  // e dividimos ESSA faixa ao meio. Vale igualmente para X e Y.
  const xCuts=[];for(let i=0;i<fullX.length-1;i++)xCuts.push(gutterBoundary(sx,fullX[i]-xi.start,fullX[i+1]-xi.start));
  const yCuts=[];for(let i=0;i<fullY.length-1;i++)yCuts.push(gutterBoundary(sy,fullY[i]-yi.start,fullY[i+1]-yi.start));
  const xb=[trimLeft,...xCuts.map(c=>xi.start+c.boundary),trimRight];
  const yb=[trimTop,...yCuts.map(c=>yi.start+c.boundary),trimBottom];
  const cells=[];for(let r=0;r<fullY.length;r++)for(let col=0;col<fullX.length;col++)cells.push({row:r+1,col:col+1,x:xb[col],y:yb[r],w:xb[col+1]-xb[col],h:yb[r+1]-yb[r]});
  const inv=1/scale;
  return{
    scale,down:{w,h},
    panel:{x:xi.start*inv,y:yi.start*inv,w:pw*inv,h:ph*inv},
    trimmed:{x:trimLeft*inv,y:trimTop*inv,w:(trimRight-trimLeft)*inv,h:(trimBottom-trimTop)*inv},
    allColumns:xPeaks.map(v=>v*inv),allRows:yPeaks.map(v=>v*inv),
    columns:fullX.map(v=>v*inv),rows:fullY.map(v=>v*inv),
    xBoundaries:xb.map(v=>v*inv),yBoundaries:yb.map(v=>v*inv),
    xGutters:xCuts.map(c=>c.gutter?{start:(xi.start+c.gutter.start)*inv,end:(xi.start+c.gutter.end+1)*inv}:null),
    yGutters:yCuts.map(c=>c.gutter?{start:(yi.start+c.gutter.start)*inv,end:(yi.start+c.gutter.end+1)*inv}:null),
    topGutter:topCut.gutter?{start:(yi.start+topCut.gutter.start)*inv,end:(yi.start+topCut.gutter.end+1)*inv}:null,
    bottomGutter:bottomCut.gutter?{start:(yi.start+bottomCut.gutter.start)*inv,end:(yi.start+bottomCut.gutter.end+1)*inv}:null,
    topMode:topCut.mode,bottomMode:bottomCut.mode,topEdgeRatio:topCut.edgeRatio,bottomEdgeRatio:bottomCut.edgeRatio,
    dx:dx*inv,dy:dy*inv,xPeriodScore:xp.corr,yPeriodScore:yp.corr,
    cells:cells.map(q=>({row:q.row,col:q.col,x:q.x*inv,y:q.y*inv,w:q.w*inv,h:q.h*inv}))
  }
}

function cellCanvas(img,box){
  const w=Math.max(8,Math.round(box.w)),h=Math.max(8,Math.round(box.h));
  const c=document.createElement("canvas");c.width=w;c.height=h;
  c.getContext("2d",{willReadFrequently:true}).drawImage(img,box.x,box.y,box.w,box.h,0,0,w,h);
  return c;
}
function estimateCellBg(data,w,h){
  const rs=[],gs=[],bs=[],edge=Math.max(3,Math.round(Math.min(w,h)*.055));
  function add(x,y){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(r>210&&g>205&&b>155&&r>=g-8&&g>b+4){rs.push(r);gs.push(g);bs.push(b)}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<edge||x>=w-edge||y<edge||y>=h-edge)add(x,y);
  if(rs.length<30)return [...BG];
  return [median(rs),median(gs),median(bs)];
}
function analyzeCell(img,cell){
  const canvas=cellCanvas(img,cell),w=canvas.width,h=canvas.height,ctx=canvas.getContext("2d",{willReadFrequently:true}),data=ctx.getImageData(0,0,w,h).data,bg=estimateCellBg(data,w,h);
  const fg=new Float32Array(w*h),textMask=new Uint8Array(w*h),boundary=new Uint8Array(w*h),allFg=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],dist=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);
    // Não removemos pixels apenas por serem brancos ou pretos: isso apagava Goat
    // Cheese, Land Deed e outras artes claras. A quantidade será tratada como outlier.
    textMask[y*w+x]=0;fg[y*w+x]=clamp((dist-11)/52,0,1);
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(fg[i]<.30)continue;
    if(fg[i-1]<.13||fg[i+1]<.13||fg[i-w]<.13||fg[i+w]<.13)boundary[i]=1;
    if(((x+y)&1)===0)allFg.push({x:x+.5,y:y+.5,w:fg[i]});
  }
  const edgeDist=new Float32Array(w*h),far=1e4,diag=Math.SQRT2;
  for(let i=0;i<edgeDist.length;i++)edgeDist[i]=boundary[i]?0:far;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let v=edgeDist[i];if(x)v=Math.min(v,edgeDist[i-1]+1);if(y)v=Math.min(v,edgeDist[i-w]+1);if(x&&y)v=Math.min(v,edgeDist[i-w-1]+diag);if(x+1<w&&y)v=Math.min(v,edgeDist[i-w+1]+diag);edgeDist[i]=v}
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let v=edgeDist[i];if(x+1<w)v=Math.min(v,edgeDist[i+1]+1);if(y+1<h)v=Math.min(v,edgeDist[i+w]+1);if(x+1<w&&y+1<h)v=Math.min(v,edgeDist[i+w+1]+diag);if(x&&y+1<h)v=Math.min(v,edgeDist[i+w-1]+diag);edgeDist[i]=v}
  function sparseFg(limit){if(allFg.length<=limit)return allFg.slice();const out=[],step=allFg.length/limit;for(let k=0;k<limit;k++)out.push(allFg[Math.min(allFg.length-1,Math.floor((k+.5)*step))]);return out}
  return{canvas,w,h,data,bg,cell,fg,textMask,edgeDist,fgCoarse:sparseFg(64),fgFine:sparseFg(180)};
}
let quantityTemplates=null;
function getQuantityTemplates(){
  if(quantityTemplates)return quantityTemplates;
  quantityTemplates=QUANTITY_TEMPLATE_RAW.map(q=>{const raw=atob(q.b),bits=new Uint8Array(QUANTITY_W*QUANTITY_H);let k=0;for(let i=0;i<raw.length&&k<bits.length;i++){const byte=raw.charCodeAt(i);for(let bit=7;bit>=0&&k<bits.length;bit--)bits[k++]=(byte>>bit)&1}return{digit:q.d,aspect:q.a,bits}});
  return quantityTemplates;
}
function maskComponents(mask,w,h){
  const seen=new Uint8Array(w*h),out=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const start=y*w+x;if(!mask[start]||seen[start])continue;const stack=[start];seen[start]=1;let minX=x,maxX=x,minY=y,maxY=y,count=0;while(stack.length){const q=stack.pop(),qx=q%w,qy=Math.floor(q/w);count++;if(qx<minX)minX=qx;if(qx>maxX)maxX=qx;if(qy<minY)minY=qy;if(qy>maxY)maxY=qy;for(let yy=Math.max(0,qy-1);yy<=Math.min(h-1,qy+1);yy++)for(let xx=Math.max(0,qx-1);xx<=Math.min(w-1,qx+1);xx++){const ni=yy*w+xx;if(mask[ni]&&!seen[ni]){seen[ni]=1;stack.push(ni)}}}out.push({x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,count})}
  return out;
}
function normalizeQuantityGlyph(mask,w,h,b){
  const out=new Uint8Array(QUANTITY_W*QUANTITY_H),roomW=QUANTITY_W-4,roomH=QUANTITY_H-4,scale=Math.min(roomW/b.w,roomH/b.h),nw=Math.max(1,Math.round(b.w*scale)),nh=Math.max(1,Math.round(b.h*scale)),ox=Math.floor((QUANTITY_W-nw)/2),oy=Math.floor((QUANTITY_H-nh)/2);
  for(let dy=0;dy<nh;dy++)for(let dx=0;dx<nw;dx++){const sx=b.x+Math.min(b.w-1,Math.floor((dx+.5)*b.w/nw)),sy=b.y+Math.min(b.h-1,Math.floor((dy+.5)*b.h/nh));out[(oy+dy)*QUANTITY_W+ox+dx]=mask[sy*w+sx]}
  return out;
}
function recognizeQuantity(a){
  const w=a.w,h=a.h,d=a.data,dark=new Uint8Array(w*h),white=new Uint8Array(w*h),integral=new Int32Array((w+1)*(h+1));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4,r=d[p],g=d[p+1],b=d[p+2],lum=(r+g+b)/3,sat=Math.max(r,g,b)-Math.min(r,g,b);dark[i]=lum<100?1:0;white[i]=lum>205&&sat<50?1:0}
  for(let y=1;y<=h;y++){let row=0;for(let x=1;x<=w;x++){row+=dark[(y-1)*w+x-1];integral[y*(w+1)+x]=integral[(y-1)*(w+1)+x]+row}}
  const mask=new Uint8Array(w*h),radius=Math.max(2,Math.round(h*.035));
  for(let y=0;y<h;y++)for(let x=Math.floor(w*.35);x<w;x++){const i=y*w+x;if(!white[i])continue;const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1),darkCount=integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0];if(darkCount)mask[i]=1}
  let candidates=maskComponents(mask,w,h).filter(q=>q.count>=Math.max(10,h*h*.0012)&&q.h>=h*.22&&q.h<=h*.42&&q.x>=w*.35).sort((u,v)=>u.x-v.x),boxes=[];
  if(candidates.length){boxes=[candidates[candidates.length-1]];for(let i=candidates.length-2;i>=0&&boxes.length<4;i--){const q=candidates[i],prev=boxes[boxes.length-1],gap=prev.x-(q.x+q.w),ratio=Math.max(q.h,prev.h)/Math.max(1,Math.min(q.h,prev.h));if(gap<=h*.13&&Math.abs((q.y+q.h)-(prev.y+prev.h))<=h*.06&&ratio<=1.25)boxes.push(q);else break}boxes.sort((u,v)=>u.x-v.x)}
  if(!boxes.length)return{recognized:null,effectiveValue:null,text:"",confidence:0,confidenceLevel:"none",digits:[],box:null,review:{status:"unreviewed",correctValue:null}};
  const refs=getQuantityTemplates(),digits=[];
  for(const box of boxes){const bits=normalizeQuantityGlyph(mask,w,h,box),aspect=box.w/box.h,classScores=[];for(let digit=0;digit<=9;digit++){let best=Infinity;for(const ref of refs){if(ref.digit!==digit)continue;let different=0;for(let k=0;k<bits.length;k++)if(bits[k]!==ref.bits[k])different++;const score=different/bits.length+.12*Math.abs(aspect-ref.aspect);if(score<best)best=score}classScores.push({digit,score:best})}classScores.sort((u,v)=>u.score-v.score);const first=classScores[0],second=classScores[1],margin=second.score-first.score,confidence=clamp((1-first.score*2.2)*clamp(margin/.10,0,1),0,1);digits.push({value:first.digit,confidence,bestDistance:first.score,margin,box:{x:box.x,y:box.y,w:box.w,h:box.h}})}
  const text=digits.map(q=>q.value).join(""),recognized=/^\d{1,4}$/.test(text)?Number(text):null,confidence=Math.min(...digits.map(q=>q.confidence)),minX=Math.min(...boxes.map(q=>q.x)),minY=Math.min(...boxes.map(q=>q.y)),maxX=Math.max(...boxes.map(q=>q.x+q.w)),maxY=Math.max(...boxes.map(q=>q.y+q.h)),pad=Math.ceil(h*.04),box={x:Math.max(0,minX-pad),y:Math.max(0,minY-pad),w:Math.min(w,maxX+pad)-Math.max(0,minX-pad),h:Math.min(h,maxY+pad)-Math.max(0,minY-pad)};
  return{recognized,effectiveValue:recognized,text,confidence,confidenceLevel:confidence>=.72?"high":confidence>=.45?"medium":"low",digits,box,review:{status:"unreviewed",correctValue:null}};
}
function quantityCropCanvas(a,q){const c=document.createElement("canvas");if(!q.box){c.width=1;c.height=1;return c}c.width=Math.max(1,Math.round(q.box.w));c.height=Math.max(1,Math.round(q.box.h));c.getContext("2d").drawImage(a.canvas,q.box.x,q.box.y,q.box.w,q.box.h,0,0,c.width,c.height);return c}
function tightCellVisual(a){
  const w=a.w,h=a.h,d=a.data,extreme=new Uint8Array(w*h),textSeed=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,p=i*4,r=d[p],g=d[p+1],b=d[p+2],lum=(r+g+b)/3,sat=Math.max(r,g,b)-Math.min(r,g,b);if(x>w*.34&&sat<48&&(lum<82||lum>205))extreme[i]=lum<82?1:2}
  for(let y=2;y<h-2;y++)for(let x=Math.max(2,Math.floor(w*.34));x<w-2;x++){const i=y*w+x,v=extreme[i];if(!v)continue;let opposite=false;for(let yy=y-3;yy<=y+3&&!opposite;yy++)for(let xx=x-3;xx<=x+3;xx++){const ov=extreme[yy*w+xx];if(ov&&ov!==v){opposite=true;break}}if(opposite)textSeed[i]=1}
  const visited=new Uint8Array(w*h),numberMask=new Uint8Array(w*h),boxes=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const start=y*w+x;if(!textSeed[start]||visited[start])continue;const stack=[start];visited[start]=1;let minX=x,maxX=x,minY=y,maxY=y,count=0;while(stack.length){const q=stack.pop(),qx=q%w,qy=Math.floor(q/w);count++;minX=Math.min(minX,qx);maxX=Math.max(maxX,qx);minY=Math.min(minY,qy);maxY=Math.max(maxY,qy);for(let yy=Math.max(0,qy-2);yy<=Math.min(h-1,qy+2);yy++)for(let xx=Math.max(0,qx-2);xx<=Math.min(w-1,qx+2);xx++){const ni=yy*w+xx;if(textSeed[ni]&&!visited[ni]){visited[ni]=1;stack.push(ni)}}}const bw=maxX-minX+1,bh=maxY-minY+1,cx=(minX+maxX)/2;if(count>6&&bh>h*.13&&bh<h*.88&&bw<w*.32&&cx>w*.47)boxes.push({x:minX,y:minY,w:bw,h:bh})}
  if(boxes.length){let minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h));const pad=Math.ceil(Math.min(w,h)*.025);minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w,maxX+pad);maxY=Math.min(h,maxY+pad);boxes.splice(0,boxes.length,{x:minX,y:minY,w:maxX-minX,h:maxY-minY});for(let yy=minY;yy<maxY;yy++)for(let xx=minX;xx<maxX;xx++)numberMask[yy*w+xx]=1}
  let minX=w,minY=h,maxX=-1,maxY=-1,strong=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(numberMask[i]||a.fg[i]<.20)continue;strong++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  if(maxX<0){minX=0;minY=0;maxX=w-1;maxY=h-1}const rawW=maxX-minX+1,rawH=maxY-minY+1,pad=Math.ceil(Math.max(rawW,rawH)*.06),bx=Math.max(0,minX-pad),by=Math.max(0,minY-pad),br=Math.min(w,maxX+pad+1),bb=Math.min(h,maxY+pad+1),bw=br-bx,bh=bb-by;
  const source=document.createElement("canvas");source.width=w;source.height=h;const sx=source.getContext("2d");sx.drawImage(a.canvas,0,0);sx.fillStyle=`rgb(${a.bg.map(Math.round).join(",")})`;for(const b of boxes)sx.fillRect(b.x,b.y,b.w,b.h);
  const canvas=visualFrame(TIGHT_SIZE),ctx=canvas.getContext("2d"),room=TIGHT_SIZE-28;let dw=room,dh=room;if(bw>=bh)dh=room*bh/bw;else dw=room*bw/bh;ctx.drawImage(source,bx,by,bw,bh,(TIGHT_SIZE-dw)/2,(TIGHT_SIZE-dh)/2,dw,dh);
  return{canvas,box:{x:bx,y:by,w:bw,h:bh},numberBoxes:boxes,strongPixels:strong};
}
async function tightRank(a){const view=tightCellVisual(a),rows=await embeddingBatch([view.canvas]),embedding=rows[0],all=templates.map(t=>({id:t.id,slug:t.slug,name:t.name,distance:cosineDistance(embedding,t.tightEmbedding)})).sort((x,y)=>x.distance-y.distance);return{view,top:all.slice(0,TOP_K),all:all.slice(0,FAST_CANDIDATES),embedding}}
function visualSignature(canvas){const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(canvas,0,0,32,32);const d=x.getImageData(0,0,32,32).data,out=new Uint8Array(32*32*3);for(let i=0,j=0;i<d.length;i+=4){out[j++]=d[i];out[j++]=d[i+1];out[j++]=d[i+2]}return out}
function signatureSimilarity(a,b){
  if(!a||!b||a.length!==b.length)return 0;let best=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let sum=0,count=0;for(let y=Math.max(0,-dy);y<Math.min(32,32-dy);y++)for(let x=Math.max(0,-dx);x<Math.min(32,32-dx);x++){const ai=(y*32+x)*3,bi=((y+dy)*32+x+dx)*3,af=Math.hypot(a[ai]-BG[0],a[ai+1]-BG[1],a[ai+2]-BG[2]),bf=Math.hypot(b[bi]-BG[0],b[bi+1]-BG[1],b[bi+2]-BG[2]);if(Math.max(af,bf)<18)continue;sum+=Math.abs(a[ai]-b[bi])+Math.abs(a[ai+1]-b[bi+1])+Math.abs(a[ai+2]-b[bi+2]);count+=3}if(count)best=Math.max(best,100*(1-sum/(count*255)))}return best
}
function memoryVote(signature){
  const allowed=new Set(activeCatalog.map(x=>Number(x.id))),perItem=new Map();
  for(const row of visualMemory){if(!allowed.has(Number(row.itemId)))continue;const similarity=signatureSimilarity(signature,row.signature);const old=perItem.get(Number(row.itemId));if(!old||similarity>old.similarity)perItem.set(Number(row.itemId),{...row,similarity})}
  const ranked=[...perItem.values()].sort((a,b)=>b.similarity-a.similarity),first=ranked[0]||null,second=ranked[1]||null,margin=first?(first.similarity-(second?.similarity||0)):0,strong=!!first&&first.similarity>=MEMORY_AUTO_SIMILARITY&&margin>=MEMORY_AUTO_MARGIN;
  return{available:visualMemory.length,eligibleExamples:[...perItem.keys()].length,first:first?{id:first.itemId,slug:first.slug,name:first.name,similarity:first.similarity}:null,second:second?{id:second.itemId,slug:second.slug,name:second.name,similarity:second.similarity}:null,margin,strong,rules:{minimumSimilarity:MEMORY_AUTO_SIMILARITY,minimumMargin:MEMORY_AUTO_MARGIN}};
}
function placementScore(a,t,targetH,x0,y0,samples,cap,edgeSamples,phase="fine"){
  const targetW=targetH*t.aspect;
  const invalid={finalScore:Infinity,colorScore:Infinity,edgeScore:100,coverageScore:100,outsidePenalty:100,hitRate:0};
  if(targetW<4||targetH<4||x0<0||y0<0||x0+targetW>a.w||y0+targetH>a.h)return invalid;
  let sum=0,wsum=0,hits=0,strong=0;
  const d=a.data,bg=a.bg,w=a.w,h=a.h;
  for(let k=0;k<samples.length;k++){
    const p=samples[k],x=Math.max(0,Math.min(w-1,Math.round(x0+p.u*targetW))),y=Math.max(0,Math.min(h-1,Math.round(y0+p.v*targetH))),i=(y*w+x)*4;
    const ar=d[i],ag=d[i+1],ab=d[i+2],alpha=p.a;
    const er=p.r*alpha+bg[0]*(1-alpha),eg=p.g*alpha+bg[1]*(1-alpha),eb=p.b*alpha+bg[2]*(1-alpha);
    let diff=(Math.abs(ar-er)+Math.abs(ag-eg)+Math.abs(ab-eb))/3;
    const bgDist=Math.hypot(ar-bg[0],ag-bg[1],ab-bg[2]);
    if(alpha>.55){strong++;if(bgDist>18)hits++;else diff+=18}
    const weight=.35+.65*alpha;sum+=Math.min(cap,diff)*weight;wsum+=weight;
  }
  if(!wsum)return invalid;
  const hitRate=strong?hits/strong:0,colorScore=sum/wsum+(1-hitRate)*18;

  // Conteúdo realmente contínuo fora da silhueta. Dois anéis evitam punir apenas
  // anti-aliasing; a máscara dilatada evita que uma normal côncava atravesse outra
  // parte legítima de objetos finos como Saw e Nail.
  const outsideValues=[],outsideStep=Math.max(1.5,Math.min(targetW,targetH)*.035);
  for(const p of (edgeSamples||[])){
    const du=p.nx*outsideStep/targetW,dv=p.ny*outsideStep/targetH,tu=p.u+du*1.7,tv=p.v+dv*1.7;
    if(tu>=0&&tv>=0&&tu<1&&tv<1){const mx=Math.floor(tu*t.maskW),my=Math.floor(tv*t.maskH);if(t.maskDilated[my*t.maskW+mx])continue}
    const values=[];for(const mul of [1,2]){const ox=Math.round(x0+p.u*targetW+p.nx*outsideStep*mul),oy=Math.round(y0+p.v*targetH+p.ny*outsideStep*mul);if(ox<0||oy<0||ox>=w||oy>=h)continue;const i=(oy*w+ox)*4;values.push(Math.max(0,Math.hypot(d[i]-bg[0],d[i+1]-bg[1],d[i+2]-bg[2])-15))}
    if(values.length===2)outsideValues.push(Math.min(values[0],values[1]));
  }
  let outsidePenalty=0;
  if(outsideValues.length){outsideValues.sort((x,y)=>x-y);const med=outsideValues[Math.floor(outsideValues.length*.5)],q80=outsideValues[Math.min(outsideValues.length-1,Math.floor(outsideValues.length*.8))];outsidePenalty=Math.min(100,(med*.65+q80*.35)*100/55)}

  let edgeScore=0,coverageScore=0;
  if(phase==="fine"){
    // Chamfer da silhueta: cada ponto da borda alpha deve cair perto de uma borda
    // real da célula. Distâncias são limitadas para tolerar anti-aliasing.
    let edgeSum=0,edgeCount=0;
    for(const p of (edgeSamples||[])){
      const x=Math.round(x0+p.u*targetW),y=Math.round(y0+p.v*targetH);if(x<0||y<0||x>=w||y>=h||a.textMask[y*w+x])continue;
      edgeSum+=Math.min(12,a.edgeDist[y*w+x]);edgeCount++;
    }
    edgeScore=edgeCount?edgeSum/edgeCount/12*100:100;

    // Cobertura simétrica: agora também perguntamos quanto do objeto real fica sem
    // explicação pelo alpha dilatado do PNG. É a parte ausente no score da v0.3.2.
    let unexplained=0,total=0;
    for(const q of a.fgFine){
      if(q.w<=0)continue;total+=q.w;const u=(q.x-x0)/targetW,v=(q.y-y0)/targetH;
      if(u<0||v<0||u>=1||v>=1){unexplained+=q.w;continue}
      const mx=Math.min(t.maskW-1,Math.max(0,Math.floor(u*t.maskW))),my=Math.min(t.maskH-1,Math.max(0,Math.floor(v*t.maskH)));
      if(!t.maskDilated[my*t.maskW+mx])unexplained+=q.w;
    }
    // Até 14% de conteúdo discrepante é tratado como possível quantidade sobreposta.
    // Acima disso, a penalidade cresce normalmente e continua bloqueando templates parciais.
    const rawCoverage=total?unexplained/total:1;coverageScore=clamp((rawCoverage-.14)/.86,0,1)*100;
  }
  // Aparência continua sendo a evidência principal. Geometria é independente e
  // suficientemente forte para desempatar candidatos visualmente próximos.
  const finalScore=phase==="coarse"?colorScore+outsidePenalty*.10:colorScore*.55+edgeScore*.20+coverageScore*.20+outsidePenalty*.05;
  return{finalScore,colorScore,edgeScore,coverageScore,outsidePenalty,hitRate};
}
function axisPositions(maxPos,step){
  maxPos=Math.max(0,maxPos);step=Math.max(1,step);
  if(maxPos<=step)return[0,maxPos].filter((v,i,a)=>i===0||Math.abs(v-a[0])>.5);
  const out=[];for(let p=0;p<=maxPos;p+=step)out.push(p);if(maxPos-out[out.length-1]>.5)out.push(maxPos);return out;
}
function coarseSearch(a,t){
  let best={score:Infinity,x:0,y:0,w:0,h:0,heightRatio:0,components:null};
  const xStep=Math.max(5,Math.round(a.w*.045)),yStep=Math.max(4,Math.round(a.h*.065));
  for(const hr of COARSE_HEIGHT_RATIOS){
    const th=a.h*hr,tw=th*t.aspect;if(tw>a.w*.94||th>a.h*.94)continue;
    const xs=axisPositions(a.w-tw,xStep),ys=axisPositions(a.h-th,yStep);
    for(let yi=0;yi<ys.length;yi++)for(let xi=0;xi<xs.length;xi++){
      const metrics=placementScore(a,t,th,xs[xi],ys[yi],t.coarse,78,t.edgeCoarse,"coarse"),s=metrics.finalScore;
      if(s<best.score)best={score:s,x:xs[xi],y:ys[yi],w:tw,h:th,heightRatio:hr,components:metrics};
    }
  }
  return best;
}
function combineMetrics(metrics,correlation){
  const structureScore=(1-clamp(correlation,0,1))*100;
  const finalScore=metrics.colorScore*.44+metrics.edgeScore*.16+metrics.coverageScore*.16+metrics.outsidePenalty*.05+structureScore*.19;
  return{...metrics,structureScore,structureCorrelation:correlation,finalScore};
}
function openCvFineSearch(a,t,seed,cellGradient){
  if(!Number.isFinite(seed.score))return seed;let best={...seed,score:Infinity,components:null};
  const ratios=[.88,.93,.97,1,1.04,1.09,1.15];
  for(const mul of ratios){
    const th=Math.max(8,Math.round(seed.h*mul)),tw=Math.max(8,Math.round(th*t.aspect));if(tw>=a.w||th>=a.h||tw>a.w*.97||th>a.h*.97)continue;
    const resizedGradient=new cv.Mat(),resizedMask=new cv.Mat(),result=new cv.Mat();
    try{
      const size=new cv.Size(tw,th);cv.resize(t.cvGradient,resizedGradient,size,0,0,cv.INTER_AREA);cv.resize(t.cvMask,resizedMask,size,0,0,cv.INTER_NEAREST);
      cv.matchTemplate(cellGradient,resizedGradient,result,cv.TM_CCORR_NORMED,resizedMask);const mm=cv.minMaxLoc(result),correlation=mm.maxVal;
      if(!Number.isFinite(correlation))continue;const x=mm.maxLoc.x,y=mm.maxLoc.y,metrics=combineMetrics(placementScore(a,t,th,x,y,t.fine,92,t.edgeFine,"fine"),correlation),s=metrics.finalScore;
      if(s<best.score)best={score:s,x,y,w:tw,h:th,heightRatio:th/a.h,components:metrics};
    }finally{resizedGradient.delete();resizedMask.delete();result.delete()}
  }
  return best;
}
async function rankCell(a,candidateTemplates=templates){
  const coarse=[];
  for(let i=0;i<candidateTemplates.length;i++)coarse.push({i,fit:coarseSearch(a,candidateTemplates[i])});
  coarse.sort((u,v)=>u.fit.score-v.fit.score);coarse.forEach((c,k)=>c.coarseRank=k+1);
  const byColor=[...coarse].sort((u,v)=>u.fit.components.colorScore-v.fit.components.colorScore);byColor.forEach((c,k)=>c.colorCoarseRank=k+1);
  const selected=new Map();for(const c of coarse.slice(0,FINE_CANDIDATES))selected.set(c.i,c);for(const c of byColor.slice(0,COLOR_CANDIDATES))selected.set(c.i,c);
  const finalists=[],cellGradient=cvGradient(a.canvas);
  try{for(const c of selected.values()){
    const t=candidateTemplates[c.i],fit=openCvFineSearch(a,t,c.fit,cellGradient);
    finalists.push({template:t,fit,coarseScore:c.fit.score,coarseRank:c.coarseRank,colorCoarseRank:c.colorCoarseRank});
  }}finally{cellGradient.delete()}
  finalists.sort((u,v)=>u.fit.score-v.fit.score);
  finalists.forEach((q,i)=>q.classicRank=i+1);const classicFirst={template:finalists[0].template,score:finalists[0].fit.score};
  const pool=finalists.slice(0,EMBEDDING_CANDIDATES),vectors=await embeddingBatch(pool.map(q=>matchedVisualCanvas(a,q.template,q.fit)));
  for(let i=0;i<pool.length;i++){pool[i].classicScore=pool[i].fit.score;pool[i].embeddingScore=cosineDistance(vectors[i],pool[i].template.embedding)}
  function normalized(value,values){const lo=Math.min(...values),hi=quantile(values,.88);return clamp((value-lo)/Math.max(.0001,hi-lo),0,1)}
  const classicValues=pool.map(q=>q.classicScore),embeddingValues=pool.map(q=>q.embeddingScore);
  for(const q of pool){q.classicNormalized=normalized(q.classicScore,classicValues);q.embeddingNormalized=normalized(q.embeddingScore,embeddingValues);q.fit.score=100*(CLASSIC_WEIGHT*q.classicNormalized+EMBEDDING_WEIGHT*q.embeddingNormalized)}
  pool.sort((u,v)=>u.fit.score-v.fit.score);const top=pool.slice(0,TOP_K);
  return{first:top[0],second:top[1],top,finalists:pool,classicFirst};
}

async function recognizeOne(file,batchIndex,batchTotal){
  const started=performance.now();shotFile=file;shotImage=await imageFromBlob(file);status(`Print ${batchIndex}/${batchTotal} — ${file.name}: segmentando o painel…`,"run");await yieldFrame();
  const grid=detectPanelAndGrid(shotImage),boxes=grid.cells;if(!boxes.length)throw new Error(`Nenhuma célula completa foi encontrada em ${file.name}.`);
  progressEl.max=boxes.length;progressEl.value=0;const detections=[];
  for(let i=0;i<boxes.length;i++){
    const cellStarted=performance.now(),cell=boxes[i],analysis=analyzeCell(shotImage,cell),quantity=recognizeQuantity(analysis);quantity.review.status="auto_accepted";
    if(quantity.recognized===0){
      detections.push({row:cell.row,col:cell.col,cx:cell.x+cell.w/2,cy:cell.y+cell.h/2,cell:{x:cell.x,y:cell.y,w:cell.w,h:cell.h},zeroSkipped:true,excludedFromInventory:true,excludeReason:"quantity_zero",predicted:null,finalPredicted:null,decision:{source:"quantity-zero",agree:null,override:false,needsReview:false},quantity,timing:{totalMs:performance.now()-cellStarted,shortcut:"quantity_zero"},review:{status:"not_applicable",appliesTo:null,correctItem:null,note:"Ícone não processado porque a quantidade é zero."},analysis,quantityCanvas:quantityCropCanvas(analysis,quantity)});progressEl.value=i+1;await yieldFrame();continue;
    }
    status(`Print ${batchIndex}/${batchTotal} — ${file.name}\nCélula ${i+1}/${boxes.length}: memória → peneira visual → OpenCV quando necessário…`,"run");
    const tightStarted=performance.now(),tight=await tightRank(analysis),tightMs=performance.now()-tightStarted,tf=tight.top[0],signature=visualSignature(tight.view.canvas),memory=memoryVote(signature),tightGap=tight.top.length>1?tight.top[1].distance-tf.distance:999;
    if(memory.strong&&memory.first){
      const final={...memory.first,score:100-memory.first.similarity},finalTemplate=templates.find(t=>t.id===Number(final.id)),tightTemplate=templates.find(t=>t.id===Number(tf.id)),b=tight.view.box,match={localX:b.x,localY:b.y,localW:b.w,localH:b.h,heightRatio:b.h/analysis.h,coarseScore:null,coarseRank:null,colorCoarseRank:null,components:null},candidates=[final,...tight.top.filter(q=>Number(q.id)!==Number(final.id))].slice(0,TOP_K).map((q,idx)=>({rank:idx+1,id:q.id,slug:q.slug,name:q.name,score:q.score??q.distance??0,gapFromFirst:idx?null:0,match}));
      detections.push({row:cell.row,col:cell.col,cx:cell.x+cell.w/2,cy:cell.y+cell.h/2,cell:{x:cell.x,y:cell.y,w:cell.w,h:cell.h},zeroSkipped:false,excludedFromInventory:false,predicted:final,finalPredicted:final,decision:{source:"memory",agree:Number(final.id)===Number(tf.id),override:true,needsReview:false,fastPath:true,fallbackUsed:false,tightGap,baselineGap:null,rules:{fastCandidates:FAST_CANDIDATES,memoryAutoSimilarity:MEMORY_AUTO_SIMILARITY,memoryAutoMargin:MEMORY_AUTO_MARGIN}},memory,baselinePredicted:final,tightPredicted:{id:tf.id,slug:tf.slug,name:tf.name,score:tf.distance},tightCandidates:tight.top.map((q,idx)=>({...q,rank:idx+1})),tightCandidates36:tight.all.map((q,idx)=>({...q,rank:idx+1})),tightCrop:{box:tight.view.box,numberBoxes:tight.view.numberBoxes,strongPixels:tight.view.strongPixels,inputSize:TIGHT_SIZE},quantity,timing:{totalMs:performance.now()-cellStarted,tightMs,classicMs:0,shortcut:"memory"},review:{status:"auto_accepted",appliesTo:"finalPredicted",correctItem:null,note:"",confidenceSource:"strong_visual_memory"},classicPredicted:final,second:tight.top[1]||final,candidates,gap:null,ratio:null,match,secondMatch:null,analysis,templateRef:finalTemplate,baselineTemplate:finalTemplate,tightTemplate,tightCanvas:tight.view.canvas,quantityCanvas:quantityCropCanvas(analysis,quantity),memorySignature:signature});progressEl.value=i+1;await yieldFrame();continue;
    }
    const fastIds=new Set(tight.all.map(q=>Number(q.id)));for(const id of confusionCandidateIds([...fastIds]))fastIds.add(id);const fastTemplates=templates.filter(t=>fastIds.has(Number(t.id))),classicStarted=performance.now();let ranked=await rankCell(analysis,fastTemplates),f=ranked.first,s=ranked.second,gap=s.fit.score-f.fit.score,agree=Number(tf.id)===Number(f.template.id),fallbackUsed=false,fallbackReason=null;
    if(fastTemplates.length<templates.length&&(!agree||tightGap<FAST_AGREEMENT_MIN_GAP)){fallbackUsed=true;fallbackReason=!agree?"method_disagreement":"small_tight_margin";ranked=await rankCell(analysis,templates);f=ranked.first;s=ranked.second;gap=s.fit.score-f.fit.score;agree=Number(tf.id)===Number(f.template.id)}
    const classicMs=performance.now()-classicStarted,ratio=f.fit.score>0?s.fit.score/f.fit.score:999,override=!agree&&tightGap>=TIGHT_OVERRIDE_GAP&&gap<=BASELINE_UNCERTAIN_GAP,final=override?{id:tf.id,slug:tf.slug,name:tf.name,score:tf.distance}:{id:f.template.id,slug:f.template.slug,name:f.template.name,score:f.fit.score},source=agree?"agreement":(override?"tight":"baseline"),candidates=ranked.top.map((q,idx)=>({rank:idx+1,id:q.template.id,slug:q.template.slug,name:q.template.name,score:q.fit.score,gapFromFirst:q.fit.score-f.fit.score,ratioToFirst:f.fit.score>0?q.fit.score/f.fit.score:999,coarseScore:q.coarseScore,coarseRank:q.coarseRank,colorCoarseRank:q.colorCoarseRank,classicRank:q.classicRank,classicScore:q.classicScore,embeddingScore:q.embeddingScore,classicNormalized:q.classicNormalized,embeddingNormalized:q.embeddingNormalized,colorScore:q.fit.components.colorScore,edgeScore:q.fit.components.edgeScore,coverageScore:q.fit.components.coverageScore,outsidePenalty:q.fit.components.outsidePenalty,structureScore:q.fit.components.structureScore,structureCorrelation:q.fit.components.structureCorrelation,hitRate:q.fit.components.hitRate,finalScore:q.fit.score,match:{localX:q.fit.x,localY:q.fit.y,localW:q.fit.w,localH:q.fit.h,heightRatio:q.fit.heightRatio}})),cf=ranked.classicFirst,finalTemplate=templates.find(t=>t.id===Number(final.id))||f.template,tightTemplate=templates.find(t=>t.id===Number(tf.id));
    detections.push({row:cell.row,col:cell.col,cx:cell.x+cell.w/2,cy:cell.y+cell.h/2,cell:{x:cell.x,y:cell.y,w:cell.w,h:cell.h},zeroSkipped:false,excludedFromInventory:false,predicted:final,finalPredicted:final,decision:{source,agree,override,needsReview:!agree,fastPath:!fallbackUsed,fallbackUsed,fallbackReason,candidateCount:fastTemplates.length,tightGap,baselineGap:gap,rules:{fastCandidates:FAST_CANDIDATES,fastAgreementMinGap:FAST_AGREEMENT_MIN_GAP,tightOverrideGap:TIGHT_OVERRIDE_GAP,baselineUncertainGap:BASELINE_UNCERTAIN_GAP,memoryAutoSimilarity:MEMORY_AUTO_SIMILARITY,memoryAutoMargin:MEMORY_AUTO_MARGIN}},memory,baselinePredicted:{id:f.template.id,slug:f.template.slug,name:f.template.name,score:f.fit.score},tightPredicted:{id:tf.id,slug:tf.slug,name:tf.name,score:tf.distance},tightCandidates:tight.top.map((q,idx)=>({...q,rank:idx+1})),tightCandidates36:tight.all.map((q,idx)=>({...q,rank:idx+1})),tightCrop:{box:tight.view.box,numberBoxes:tight.view.numberBoxes,strongPixels:tight.view.strongPixels,inputSize:TIGHT_SIZE},quantity,timing:{totalMs:performance.now()-cellStarted,tightMs,classicMs,shortcut:null},review:{status:agree?"auto_accepted":"unreviewed",appliesTo:"finalPredicted",correctItem:null,note:"",confidenceSource:agree?"methods_agree":"requires_review"},classicPredicted:{id:cf.template.id,slug:cf.template.slug,name:cf.template.name,score:cf.score},second:{id:s.template.id,slug:s.template.slug,name:s.template.name,score:s.fit.score},candidates,gap,ratio,match:{localX:f.fit.x,localY:f.fit.y,localW:f.fit.w,localH:f.fit.h,heightRatio:f.fit.heightRatio,coarseScore:f.coarseScore,coarseRank:f.coarseRank,colorCoarseRank:f.colorCoarseRank,components:f.fit.components},secondMatch:{localX:s.fit.x,localY:s.fit.y,localW:s.fit.w,localH:s.fit.h,heightRatio:s.fit.heightRatio,coarseScore:s.coarseScore,coarseRank:s.coarseRank,colorCoarseRank:s.colorCoarseRank,components:s.fit.components},analysis,templateRef:finalTemplate,baselineTemplate:f.template,tightTemplate,tightCanvas:tight.view.canvas,quantityCanvas:quantityCropCanvas(analysis,quantity),memorySignature:signature});
    progressEl.value=i+1;await yieldFrame();
  }
  const totalMs=performance.now()-started,report={version:VERSION,generated_at:new Date().toISOString(),engine:"v080-memory-first-mobilenet-prefilter-opencv-fallback",quantityEngine:"hayday-white-fill-digit-templates-v1-frozen",farm:{name:farmName,level:selectedFarmLevel()},candidateCatalog:{total:catalog.length,eligible:activeCatalog.length},memoryEngine:{storedExamples:visualMemory.length,storedConfusions:confusionHistory.length,minimumSimilarity:MEMORY_AUTO_SIMILARITY,minimumMargin:MEMORY_AUTO_MARGIN,storesOnlyCorrections:true},speedEngine:{fastCandidates:FAST_CANDIDATES,fastAgreementMinGap:FAST_AGREEMENT_MIN_GAP,memoryFirst:true,fullFallback:true,embeddingCache:true},opencv:"4.13.0-local",tensorflow:"4.22.0-local",model:"MobileNetV2-alpha050-local",embeddingDimensions:embeddingSize,tightInputSize:TIGHT_SIZE,arbitration:{tightOverrideGap:TIGHT_OVERRIDE_GAP,baselineUncertainGap:BASELINE_UNCERTAIN_GAP},weights:{baselineClassic:CLASSIC_WEIGHT,baselineEmbedding:EMBEDDING_WEIGHT},offline:true,image:{name:file.name,width:shotImage.naturalWidth,height:shotImage.naturalHeight},geometry:{panel:grid.panel,trimmed:grid.trimmed,columns:grid.columns,rows:grid.rows,allColumnPeaks:grid.allColumns,allRowPeaks:grid.allRows,xBoundaries:grid.xBoundaries,yBoundaries:grid.yBoundaries,dx:grid.dx,dy:grid.dy,xPeriodScore:grid.xPeriodScore,yPeriodScore:grid.yPeriodScore,topMode:grid.topMode,bottomMode:grid.bottomMode,topEdgeRatio:grid.topEdgeRatio,bottomEdgeRatio:grid.bottomEdgeRatio},totalMs,detections:detections.map(({analysis,templateRef,baselineTemplate,tightTemplate,tightCanvas,quantityCanvas,memorySignature,...d})=>d)};
  return{report,grid,detections,image:shotImage,file};
}
function applyBatchConsistency(runs){
  const rows=[];for(let ri=0;ri<runs.length;ri++)for(let di=0;di<runs[ri].detections.length;di++){const d=runs[ri].detections[di],report=runs[ri].report.detections[di];if(!d.zeroSkipped){for(const target of [d,report]){target.batchConflict=false;target.overlapDuplicate=false;delete target.duplicateOf;delete target.overlapCopies;target.excludedFromInventory=false;delete target.excludeReason}const effectiveItem=d.review.correctItem||d.finalPredicted;if(effectiveItem)rows.push({runIndex:ri,detectionIndex:di,d,report,effectiveItem})}}
  const byItem=new Map();for(const row of rows){const id=Number(row.effectiveItem.id);if(!byItem.has(id))byItem.set(id,[]);byItem.get(id).push(row)}
  for(const group of byItem.values()){
    const quantities=[...new Set(group.map(x=>x.d.quantity.effectiveValue))];
    if(quantities.length>1)for(const x of group){x.d.batchConflict=true;x.report.batchConflict=true;x.d.decision.needsReview=true;x.report.decision.needsReview=true;if(x.d.review.status==="auto_accepted"){x.d.review.status="unreviewed";x.report.review.status="unreviewed"}}
    const exact=new Map();for(const x of group){const qty=x.d.quantity.effectiveValue;if(!exact.has(qty))exact.set(qty,[]);exact.get(qty).push(x)}
    for(const same of exact.values())if(same.length>1){const primary=same[0];primary.d.overlapCopies=[];primary.report.overlapCopies=primary.d.overlapCopies;for(let i=1;i<same.length;i++){const x=same[i],duplicateOf={image:runs[primary.runIndex].file.name,row:primary.d.row,col:primary.d.col},copy={image:runs[x.runIndex].file.name,row:x.d.row,col:x.d.col};primary.d.overlapCopies.push(copy);x.d.overlapDuplicate=true;x.report.overlapDuplicate=true;x.d.duplicateOf=duplicateOf;x.report.duplicateOf=duplicateOf;x.d.excludedFromInventory=true;x.report.excludedFromInventory=true;x.d.excludeReason="same_item_same_quantity_overlap";x.report.excludeReason="same_item_same_quantity_overlap"}}
  }
  if(latest){latest.summary.overlapDuplicates=runs.reduce((n,r)=>n+r.detections.filter(d=>d.overlapDuplicate).length,0);latest.summary.inventoryItems=runs.reduce((n,r)=>n+r.detections.filter(d=>!d.excludedFromInventory).length,0);latest.inventory=rows.filter(x=>!x.d.excludedFromInventory).map(x=>({item:x.effectiveItem,quantity:x.d.quantity.effectiveValue,conflict:x.d.batchConflict,reviewStatus:x.d.review.status,source:{image:runs[x.runIndex].file.name,row:x.d.row,col:x.d.col},overlapCopies:x.d.overlapCopies||[]}));latest.inventoryReady=latest.inventory.every(x=>!x.conflict&&x.reviewStatus!=="unreviewed")}
}

function toFileMap(value){if(value instanceof Map)return new Map(value);const map=new Map();for(const file of Array.from(value||[]))map.set(file.name,file);return map}
function validateCatalog(value){
  if(!Array.isArray(value)||value.length!==374)throw new Error("O catálogo precisa conter 374 itens.");
  if(value.some(item=>!Number.isFinite(Number(item.id))||!String(item.slug||"").trim()||!String(item.name_original||"").trim()||!Number.isFinite(Number(item.level))))throw new Error("Cada item do catálogo precisa de id, slug, name_original e level válidos.");
  if(new Set(value.map(item=>Number(item.id))).size!==value.length)throw new Error("Os IDs do catálogo precisam ser únicos.");
  if(new Set(value.map(item=>String(item.slug).toLowerCase())).size!==value.length)throw new Error("Os slugs do catálogo precisam ser únicos.");
}
function resourceSummary(){return{catalogItems:catalog.length,iconFiles:iconFiles.size,modelFiles:modelFiles.size,storedCorrections:visualMemory.length,storedConfusions:confusionHistory.length}}
function getLearningSummary(){return{corrections:visualMemory.length,confusions:confusionHistory.length,storage:"IndexedDB",database:"hayday-local-recognition",automaticFile:false}}
async function setResources(resources){
  validateCatalog(resources.catalog);catalog=resources.catalog;iconFiles=toFileMap(resources.icons);modelFiles=toFileMap(resources.models);
  const stems=new Set([...iconFiles.keys()].map(stem));for(const item of catalog)if(!stems.has(item.slug))throw new Error(`Ícone ausente: ${item.slug}.png`);
  for(const name of ["mobilenet-v2-model.json","group1-shard1of2.bin","group1-shard2of2.bin"])if(!modelFile(name))throw new Error(`Modelo local ausente: ${name}`);
  disposeTemplates();preparedLevel=null;await loadLearningMemory();return resourceSummary();
}
function updateSummaries(){
  if(!latest)return;const ds=latest.images.flatMap(row=>row.detections),applicable=ds.filter(d=>!d.zeroSkipped),correct=applicable.filter(d=>d.review.status==="correct").length,incorrect=applicable.filter(d=>d.review.status==="incorrect").length,autoAccepted=applicable.filter(d=>d.review.status==="auto_accepted").length,unreviewed=applicable.filter(d=>d.review.status==="unreviewed").length,reviewed=correct+incorrect;
  latest.reviewSummary={humanConfirmedCorrect:correct,humanCorrected:incorrect,autoAccepted,unreviewed,reviewed,totalApplicable:applicable.length,confirmedAccuracy:reviewed?correct/reviewed:null,complete:unreviewed===0};
  const qIncorrect=ds.filter(d=>d.quantity.review.status==="incorrect").length,qAuto=ds.filter(d=>d.quantity.review.status==="auto_accepted").length,recognized=ds.filter(d=>d.quantity.recognized!==null).length,highConfidence=ds.filter(d=>d.quantity.confidenceLevel==="high").length,memoryShortcuts=applicable.filter(d=>d.timing?.shortcut==="memory").length,fullFallbacks=applicable.filter(d=>d.decision?.fallbackUsed).length;
  latest.quantityReviewSummary={autoAccepted:qAuto,corrected:qIncorrect,total:ds.length};latest.quantityRecognitionSummary={recognized,missing:ds.length-recognized,highConfidence,total:ds.length};latest.memorySummary={storedExamples:visualMemory.length,storedConfusions:confusionHistory.length,strongVotes:applicable.filter(d=>d.memory?.strong).length,storesOnlyCorrections:true};latest.speedSummary={memoryShortcuts,fastPaths:applicable.length-memoryShortcuts-fullFallbacks,fullFallbacks,embeddingCache:true};
}
async function recognize(files,options={}){
  if(running)throw new Error("Já existe um reconhecimento em andamento.");if(!catalog.length)throw new Error("Configure os recursos antes de reconhecer.");
  const selected=Array.from(files||[]);if(!selected.length)throw new Error("Nenhum print informado.");running=true;latest=null;latestRuns=[];farmName=String(options.farmName||farmName||"Farm").trim();farmLevel=clamp(Math.round(Number(options.farmLevel)||farmLevel||1),1,300);onProgress=typeof options.onProgress==="function"?options.onProgress:()=>{};const overallStarted=performance.now();
  try{status("Inicializando OpenCV e MobileNet locais…","run");await ensureOpenCv();await ensureVisualModel();if(preparedLevel!==farmLevel||!templates.length){disposeTemplates();await prepareTemplates()}await prepareTemplateEmbeddings();const images=[],errors=[];for(let i=0;i<selected.length;i++){try{const run=await recognizeOne(selected[i],i+1,selected.length);latestRuns.push(run);images.push(run.report)}catch(error){errors.push({image:selected[i].name,error:String(error?.message||error)})}}if(!images.length)throw new Error(`Nenhum print pôde ser processado. ${errors.map(row=>`${row.image}: ${row.error}`).join(" · ")}`);
    const totalMs=performance.now()-overallStarted,totalDetections=images.reduce((n,r)=>n+r.detections.length,0),zeroSkipped=images.reduce((n,r)=>n+r.detections.filter(d=>d.zeroSkipped).length,0);latest={version:VERSION,generated_at:new Date().toISOString(),batch:true,offline:true,farm:{name:farmName,level:farmLevel},candidateCatalog:{total:catalog.length,eligible:activeCatalog.length},summary:{selectedImageCount:selected.length,imageCount:images.length,failedImageCount:errors.length,totalDetections,zeroSkipped,overlapDuplicates:0,inventoryItems:0,totalMs,averageMsPerImage:images.length?totalMs/images.length:0},errors,images};applyBatchConsistency(latestRuns);updateSummaries();status("Reconhecimento concluído.","ok");return latest;
  }finally{running=false}
}
function locateDetection(runIndex,detectionIndex){const run=latestRuns[runIndex],d=run?.detections[detectionIndex];if(!run||!d)throw new Error("Detecção não encontrada.");return{run,d,report:run.report.detections[detectionIndex]}}
async function reviewItem({runIndex,detectionIndex,status:reviewStatus,correctItem=null}){const {d,report}=locateDetection(runIndex,detectionIndex);if(d.zeroSkipped)throw new Error("Células com quantidade zero não recebem conferência de item.");if(!["correct","incorrect","unreviewed"].includes(reviewStatus))throw new Error("Status de conferência inválido.");if(reviewStatus==="incorrect"&&!correctItem)throw new Error("Informe o item correto.");let canonicalItem=null;if(reviewStatus==="incorrect"){const source=catalog.find(item=>Number(item.id)===Number(correctItem.id));if(!source)throw new Error("O item correto não existe no catálogo.");canonicalItem={id:Number(source.id),slug:source.slug,name:source.name_original}}d.review.status=reviewStatus;d.review.correctItem=canonicalItem;report.review=d.review;if(reviewStatus==="incorrect"){await saveVisualExample(d,canonicalItem);await saveConfusions(d,canonicalItem)}applyBatchConsistency(latestRuns);updateSummaries();return latest}
function reviewQuantity({runIndex,detectionIndex,correctValue}){const {d,report}=locateDetection(runIndex,detectionIndex);if(!Number.isInteger(correctValue)||correctValue<0)throw new Error("Quantidade corrigida inválida.");d.quantity.review.status="incorrect";d.quantity.review.correctValue=correctValue;d.quantity.effectiveValue=correctValue;report.quantity=d.quantity;applyBatchConsistency(latestRuns);updateSummaries();return latest}
function getReport(){return latest}
function getRuntimeRuns(){return latestRuns}
function dispose(){disposeTemplates();latestRuns=[];latest=null;onProgress=()=>{}}

global.HayDayRecognizer=Object.freeze({version:VERSION,algorithmVersion:ALGORITHM_VERSION,configureDirectory:loadRoot,configureResources:setResources,recognize,reviewItem,reviewQuantity,getReport,getRuntimeRuns,getLearningSummary,exportLearningData,importLearningData,dispose});
})(globalThis);
