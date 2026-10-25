// Минимальный локальный просмотрщик XLSX и CSV для обычных табличных файлов.
// Не использует внешний сервер или загрузку документа в облако.
const decoder=new TextDecoder('utf-8');
function csvRows(text){
  const separator=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length > (text.split(/\r?\n/,1)[0].match(/,/g)||[]).length?';':',';
  const rows=[];let current='',row=[],quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}
    else if(c===separator&&!quoted){row.push(current);current='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(current);if(row.some(v=>String(v).trim()))rows.push(row);row=[];current='';}
    else current+=c;
  }
  row.push(current);if(row.some(v=>String(v).trim()))rows.push(row);
  return rows.slice(0,5001).map(r=>r.slice(0,120));
}
function parseXML(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Некорректный XML внутри XLSX');return doc;}
function descendants(el,name){return [...el.getElementsByTagName('*')].filter(x=>x.localName===name);}
async function zipEntries(buffer){
  const view=new DataView(buffer);let end=-1;
  for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('Файл не похож на XLSX');
  const count=view.getUint16(end+10,true),base=view.getUint32(end+16,true),entries=new Map();let offset=base;
  if(count>1000)throw Error('Слишком много файлов внутри XLSX');
  for(let i=0;i<count;i++){
    if(view.getUint32(offset,true)!==0x02014b50)throw Error('Некорректный ZIP-каталог');
    const method=view.getUint16(offset+10,true),uncompressed=view.getUint32(offset+24,true),length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),start=view.getUint32(offset+42,true);
    const filename=decoder.decode(new Uint8Array(buffer,offset+46,length));
    entries.set(filename,{method,uncompressed,start,size:view.getUint32(offset+20,true)});
    offset+=46+length+extra+comment;
  }
  async function read(path){
    const e=entries.get(path);if(!e)return null;
    if(e.uncompressed>20*1024*1024)throw Error('Лист слишком большой');
    const p=e.start;if(view.getUint32(p,true)!==0x04034b50)throw Error('Некорректный ZIP-заголовок');
    const dataStart=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
    const bytes=new Uint8Array(buffer.slice(dataStart,dataStart+e.size));
    if(e.method===0)return decoder.decode(bytes);
    if(e.method!==8)throw Error('Неизвестный формат сжатия XLSX');
    if(typeof DecompressionStream==='undefined')throw Error('Этот браузер не поддерживает чтение XLSX. Сохраните файл как CSV.');
    let stream;try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
    catch(e){throw Error('Этот браузер не поддерживает распаковку XLSX. Сохраните лист как CSV.');}
    const text=await new Response(stream).text();if(text.length>20*1024*1024)throw Error('Слишком большой распакованный лист');
    return text;
  }
  return {read};
}
function sheetRows(doc,strings){
  const rows=[];
  for(const row of descendants(doc,'row').slice(0,5000)){
    const data=[];
    for(const cell of descendants(row,'c')){
      const col=(cell.getAttribute('r')||'A').match(/^[A-Z]+/)?.[0]||'A';
      let index=0;for(const ch of col)index=index*26+ch.charCodeAt(0)-64;index--;
      if(index>=120)continue;
      const type=cell.getAttribute('t');
      const raw=descendants(cell,'v')[0]?.textContent||'';
      data[index]=type==='s'?(strings[Number(raw)]||''):type==='inlineStr' ? descendants(cell,'t').map(x=>x.textContent).join(''):raw;
    }
    if(data.some(x=>String(x??'').trim()))rows.push(Array.from({length:data.length},(_,i)=>String(data[i]??'')));
  }
  return rows;
}
export async function readTables(file){
  if(file.size>8*1024*1024)throw Error('Максимальный размер файла 8 МБ');
  if(/\.csv$/i.test(file.name)){const buffer=await file.arrayBuffer();let csv=decoder.decode(buffer);if((csv.match(/\uFFFD/g)||[]).length>2)csv=new TextDecoder('windows-1251').decode(buffer);return [{name:'CSV',rows:csvRows(csv.replace(/^\uFEFF/,''))}];}
  if(!/\.xlsx$/i.test(file.name))throw Error('Поддерживаются .xlsx и .csv. Старый .xls сначала сохраните как .xlsx');
  const zip=await zipEntries(await file.arrayBuffer());
  const workbookText=await zip.read('xl/workbook.xml');if(!workbookText)throw Error('Не найден xl/workbook.xml');
  const workbook=parseXML(workbookText);
  const relText=await zip.read('xl/_rels/workbook.xml.rels');if(!relText)throw Error('Не найдены связи листов XLSX');
  const links=new Map(descendants(parseXML(relText),'Relationship').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
  const stringText=await zip.read('xl/sharedStrings.xml');
  const strings=stringText?descendants(parseXML(stringText),'si').map(e=>descendants(e,'t').map(x=>x.textContent).join('')):[];
  const sheets=[];
  for(const sh of descendants(workbook,'sheet').slice(0,30)){
    const rid=sh.getAttribute('r:id')||[...sh.attributes].find(x=>x.localName==='id')?.value;
    const target=links.get(rid);if(!target)continue;
    const path=target.startsWith('/')?target.replace(/^\//,''):new URL(target,'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1);
    const text=await zip.read(path);if(!text)continue;
    sheets.push({name:sh.getAttribute('name')||`Лист ${sheets.length+1}`,rows:sheetRows(parseXML(text),strings)});
  }
  if(!sheets.length)throw Error('В XLSX нет доступных таблиц');
  return sheets;
}
