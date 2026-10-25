// PDF-хранилище отделено от localStorage: файлы могут быть большими.
const NAME='ordinator-instructions',STORE='pdfs';
function database(){return new Promise((resolve,reject)=>{
 if(!('indexedDB' in globalThis)){reject(new Error('Браузер не поддерживает IndexedDB'));return;}
 const request=indexedDB.open(NAME,1);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Ошибка хранилища PDF'));
});}
async function operation(mode,fn){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),request=fn(tx.objectStore(STORE));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error||new Error('Сохранение PDF прервано'));});}finally{db.close();}}
export const putPdf=(id,blob)=>operation('readwrite',store=>store.put(blob,id));
export const getPdf=id=>operation('readonly',store=>store.get(id));
export const deletePdf=id=>operation('readwrite',store=>store.delete(id));
// Для извлечения текста используется Mozilla PDF.js (подгружается только при импорте файла).
// Нужен интернет для CDN; без него PDF всё равно можно сохранить, вручную заполнить сведения.
export async function pdfText(file){
 const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
 const data=await file.arrayBuffer();const pdf=await pdfjs.getDocument({data}).promise;
 let out='';for(let i=1;i<=Math.min(pdf.numPages,100);i++){const page=await pdf.getPage(i),content=await page.getTextContent();out+='\n'+content.items.map(x=>x.str||'').join(' ');if(out.length>100000)break;}
 await pdf.destroy();return out.trim();
}
export function pdfSections(text){
 const heads=[['indications','ПОКАЗАНИЯ К ПРИМЕНЕНИЮ'],['contra','ПРОТИВОПОКАЗАНИЯ'],['dose','СПОСОБ ПРИМЕНЕНИЯ И ДОЗЫ'],['side','ПОБОЧНОЕ ДЕЙСТВИЕ']];
 const caps=String(text||'').toUpperCase();const found=heads.map(([key,title])=>({key,title,at:caps.indexOf(title)})).filter(x=>x.at>=0).sort((a,b)=>a.at-b.at);
 const parts={};for(let i=0;i<found.length;i++){const a=found[i],b=found[i+1];parts[a.key]=text.slice(a.at+(a.title.length),Math.min(b?.at??text.length,a.at+3500)).trim();}
 return parts;
}
