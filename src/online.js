/* ═══════════ ОНЛАЙН-НАДСТРОЙКА · Supabase + Open-Meteo ═══════════ */
"use strict";
var SB={url:'https://oagonfdnlgqkoosvgaly.supabase.co',
 key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ29uZmRubGdxa29vc3ZnYWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTc4NTMsImV4cCI6MjEwMTMzMzg1M30.hpQyHLXKsmGVSTS-pFG66rtM_uF-8kXmj8ituNCvbww'};
/* обычно все работают с одним документом; ?sandbox=1 открывает отдельную копию для проверок */
var TRIP_ID=/[?&]sandbox=1/.test(location.search||'')?'vuoksa2026-test':'vuoksa2026';
ONLINE=true;
SAVE_STRIP=['#sync-code','#syncBar','#pwaLinks','link[rel="manifest"]','link[rel="apple-touch-icon"]',
 'meta[name^="apple-mobile-web-app"]','meta[name="mobile-web-app-capable"]','#whoOn'];

/* ═════ приложение на экране «Домой» ═════
   На айфоне скачанный HTML открывается системным просмотрщиком, где скрипты выключены, —
   поэтому офлайн там делается не файлом, а самим приложением: страница кешируется служебным
   работником, данные лежат в браузере, синхронизация подхватывается, как только появится сеть. */
function mountPwa(){
  var head=document.head;
  if(!head||document.getElementById('pwaLinks'))return;
  var box=document.createElement('meta');           /* якорь, чтобы всё это убрать при сохранении файла */
  box.id='pwaLinks';box.setAttribute('name','pwa-mounted');box.setAttribute('content','1');
  head.appendChild(box);
  function add(tag,attrs){
    var n=document.createElement(tag);
    for(var k in attrs)if(attrs.hasOwnProperty(k))n.setAttribute(k,attrs[k]);
    head.appendChild(n);return n;
  }
  add('link',{rel:'manifest',href:'manifest.webmanifest'});
  add('link',{rel:'apple-touch-icon',href:'icon-192.png'});
  add('meta',{name:'apple-mobile-web-app-capable',content:'yes'});
  add('meta',{name:'mobile-web-app-capable',content:'yes'});
  add('meta',{name:'apple-mobile-web-app-title',content:'Вуокса-2026'});
  add('meta',{name:'apple-mobile-web-app-status-bar-style',content:'black-translucent'});
  if(navigator.serviceWorker&&location.protocol==='https:'){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
}
function standalone(){
  return !!(window.navigator.standalone||(window.matchMedia&&window.matchMedia('(display-mode:standalone)').matches));
}
/* встроенные браузеры мессенджеров не умеют сохранять файлы и открывать их обратно */
function inApp(){
  var ua=navigator.userAgent||'';
  if(/Telegram|FBAN|FBAV|Instagram|Line\/|VKClient|OKApp|MiuiBrowser/i.test(ua))return true;
  return /iPhone|iPad|iPod/.test(ua)&&!/Safari/.test(ua)&&!standalone();
}
var netState='idle', netMsg='', lastPull=0, pushT=null, pulling=false;

/* ═════ права по личной ссылке ═════
   Ссылка вида ?u=Kostya&k=<ключ>. Ключ живёт в S.people[].key и меняется при смене прав —
   старая ссылка сразу перестаёт давать полномочия. Подтверждённый ключ запоминается в браузере,
   чтобы человек мог заходить и по короткому адресу. Разграничение остаётся «джентльменским»:
   anon-ключ Supabase лежит в файле, настоящее — только через Supabase Auth и RLS. */
var AUTHK='vuoksa2026.auth', authState=null, urlAuth=null, staleWarned=false;
function authGet(){try{return JSON.parse(localStorage.getItem(AUTHK)||'null');}catch(e){return null;}}
function authSet(o){try{if(o)localStorage.setItem(AUTHK,JSON.stringify(o));else localStorage.removeItem(AUTHK);}catch(e){}}
permOf=function(p){
  if(!p)return 'member';
  return (authState&&authState.id===p.id&&authState.key===p.key)?p.perm:'member';
};
canSaveFile=function(){return isChief();};
function applyAuth(){
  var a=urlAuth||authGet();
  if(!a){authState=null;return;}
  var p=null;
  S.people.forEach(function(x){if(x.id===a.id)p=x;});
  if(p&&p.key===a.key){authState=a;authSet(a);staleWarned=false;return;}
  authState=null;
  if(p&&!staleWarned){
    staleWarned=true;
    toast('Ссылка больше не действует: права изменились. Попроси у владельца новую.',null,null,9000);
  }
}
function linkFor(p){
  var base=location.href.split('?')[0].split('#')[0];
  return base+'?u='+encodeURIComponent(p.slug||p.id)+'&k='+encodeURIComponent(p.key||'');
}
function copyLink(p){
  var url=linkFor(p), done=function(){toast('Ссылка для '+rodit(p.name)+' скопирована.');};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done,function(){if(!copyOld(url))showLink(p);else done();});
    return;
  }
  if(copyOld(url))done(); else showLink(p);
}
/* запасной путь для старых браузеров и встроенного браузера Телеграма на iOS:
   там нужно именно выделение через Range, обычный select() на input не срабатывает */
function copyOld(url){
  var box=document.createElement('div');
  box.textContent=url;
  box.setAttribute('contenteditable','true');
  box.style.cssText='position:fixed;left:0;top:0;opacity:0;white-space:pre;font-size:16px';
  document.body.appendChild(box);
  var ok=false;
  try{
    var rng=document.createRange();rng.selectNodeContents(box);
    var sel=window.getSelection();sel.removeAllRanges();sel.addRange(rng);
    ok=document.execCommand('copy');
    sel.removeAllRanges();
  }catch(e){}
  box.remove();
  return ok;
}
function showLink(p){
  sheet(function(c){
    c.appendChild(el('h3',null,'Ссылка для '+rodit(p.name)));
    c.appendChild(el('p',null,'Скопировать не вышло — выдели адрес и скопируй вручную.'));
    var f=el('div','fld');var inp=el('input');inp.value=linkFor(p);f.appendChild(inp);c.appendChild(f);
    setTimeout(function(){inp.focus();inp.select();},80);
  });
}
/* кнопка под фотографией в «Экипаже» — видит только владелец */
function crewLink(card,p){
  if(!isChief())return;
  card.classList.add('hasLink');
  var b=el('button','cpLink',svg('link')+'<span>'+(p.id===S.ui.me?'Моя ссылка':'Ссылка для '+esc(rodit(p.name)))+'</span>');
  b.onclick=function(ev){ev.stopPropagation();copyLink(p);};
  var tx=card.querySelector('.cpTxt');
  (tx||card).appendChild(b);
}
/* права поменяли — старая ссылка погасла, надо отдать новую */
function linkChanged(p){
  toast('Ссылка для '+rodit(p.name)+' обновилась — отправь ему новую.','Скопировать',function(){copyLink(p);},9000);
}

function sbFetch(path,opts){
  opts=opts||{};
  var h=opts.headers||{};
  h['apikey']=SB.key; h['Authorization']='Bearer '+SB.key;
  h['Content-Type']='application/json';
  if(opts.rep)h['Prefer']='return=representation';
  return fetch(SB.url+'/rest/v1/'+path,{method:opts.method||'GET',headers:h,
    body:opts.body?JSON.stringify(opts.body):undefined});
}
function setNet(state,msg){
  netState=state; netMsg=msg||'';
  var b=document.getElementById('syncDot');
  if(!b)return;
  var col={ok:'var(--pine)',work:'var(--amber)',err:'#B4472C',off:'var(--muted)'}[state]||'var(--muted)';
  b.style.background=col;
  var l=document.getElementById('syncTxt');
  if(l)l.textContent=msg||({ok:'всё сохранено',work:'сохраняю…',err:'нет связи',off:'офлайн'}[state]||'');
}

/* ── строка состояния в шапке ── */
function mountSyncBar(){
  var hdr=document.querySelector('.hdrIn');
  if(!hdr||document.getElementById('syncBar'))return;
  var w=document.createElement('div');
  w.id='syncBar';
  w.style.cssText='display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);flex:0 1 auto;'
   +'min-width:0;padding:0 4px 0 0;white-space:nowrap;overflow:hidden';
  w.innerHTML='<i id="syncDot" style="width:9px;height:9px;border-radius:50%;background:var(--muted);display:block;flex:0 0 auto"></i>'
   +'<span id="syncTxt">подключаюсь…</span>';
  hdr.insertBefore(w,hdr.querySelector('#bSearch'));
}

/* ── чтение и запись ──
   Документ на сервере один, но правки вливаются по позициям: перед записью подтягиваем чужое,
   сливаем и пишем с условием «метка на сервере не изменилась». Если кто-то успел раньше —
   PostgREST вернёт пустой ответ, и мы повторяем цикл. Так одновременная работа не затирается. */
function editing(){
  var a=document.activeElement;
  return !!(a&&(a.isContentEditable||a.tagName==='INPUT'||a.tagName==='TEXTAREA'));
}
var pendingRender=false;
function renderSoon(){
  if(editing()){pendingRender=true;return;}   /* не выдёргиваем текст из-под руки */
  pendingRender=false;render();
}
document.addEventListener('focusout',function(){
  setTimeout(function(){if(pendingRender&&!editing())renderSoon();},250);
});
/* вливаем состояние с сервера в своё */
var tasksKnown=null;
/* пока лист открыт, о новых поручениях говорим сразу — плашка на «Поездке» может быть не видна */
function tasksNotify(){
  var n=newTasks().length;
  if(tasksKnown===null){tasksKnown=n;return;}
  if(n>tasksKnown){
    var fresh=newTasks();
    toast(tasksTitle(fresh)+'.','Показать',function(){tasksSheet();},9000);
  }
  tasksKnown=n;
}
function applyRemote(data){
  if(!data)return 0;
  var inc;
  try{inc=normalize(mergeSeed(normalize(cl(data)),SEED));}catch(e){return 0;}
  var keepUi=S.ui, r=mergeInto(inc);
  S.ui=keepUi;
  if((inc.updatedAt||'')>(S.updatedAt||''))S.updatedAt=inc.updatedAt;
  applyAuth();
  if(r.total){persist();renderSoon();}
  tasksNotify();
  return r.total;
}
function pull(force){
  if(pulling)return Promise.resolve();
  pulling=true;
  return sbFetch('trips?id=eq.'+TRIP_ID+'&select=data,updated_at,author')
   .then(function(r){ if(!r.ok)throw new Error('HTTP '+r.status); return r.json(); })
   .then(function(rows){
     pulling=false;
     if(!rows.length){ return push(true).then(function(){setNet('ok','создан на сервере');}); }
     var row=rows[0];
     if(!force && row.updated_at===lastPull){setNet('ok');return;}
     lastPull=row.updated_at;
     var n=applyRemote(row.data);
     if(n){
       setNet('ok','обновлено с сервера');
       setTimeout(function(){setNet('ok');},2000);
     } else setNet('ok');
   })
   .catch(function(e){pulling=false;setNet('err','нет связи с сервером');});
}
var pushing=false, pushAgain=false;
function push(){
  if(pushing){pushAgain=true;return Promise.resolve();}
  pushing=true;setNet('work');
  return pushTry(0).then(done,done);
  function done(e){
    pushing=false;
    if(e instanceof Error)setNet('err','правки не ушли на сервер');
    if(pushAgain){pushAgain=false;schedulePush();}
  }
}
/* маленький сигнал «документ изменился» — по нему остальные забирают свежую версию */
function ping(){
  var stamp=new Date().toISOString();
  return sbFetch('trip_pings',{method:'POST',
    body:[{trip_id:TRIP_ID,updated_at:stamp,author:(S.ui&&S.ui.me)?person(S.ui.me).name:''}],
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'}})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(out){if(out&&out[0])myPing=out[0].updated_at;},function(){});
}
function pushTry(attempt){
  S.author=(S.ui&&S.ui.me)?person(S.ui.me).name:'';
  return sbFetch('trips?id=eq.'+TRIP_ID+'&select=data,updated_at')
   .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
   .then(function(rows){
     if(!rows.length){
       var stamp0=new Date().toISOString();S.updatedAt=stamp0;
       return sbFetch('trips',{method:'POST',body:[{id:TRIP_ID,data:S,updated_at:stamp0,author:S.author}],
         headers:{'Prefer':'resolution=merge-duplicates,return=representation'}})
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(function(out){if(out&&out[0])lastPull=out[0].updated_at;setNet('ok');return ping();});
     }
     var row=rows[0];
     if(row.updated_at!==lastPull)applyRemote(row.data);   /* вобрали чужие правки */
     var stamp=new Date().toISOString();
     S.updatedAt=stamp;persist();
     return sbFetch('trips?id=eq.'+TRIP_ID+'&updated_at=eq.'+encodeURIComponent(row.updated_at),
       {method:'PATCH',rep:true,body:{data:S,updated_at:stamp,author:S.author}})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(function(out){
        if(!out.length){                                   /* кто-то записал раньше нас */
          if(attempt<4)return pushTry(attempt+1);
          throw new Error('запись не прошла');
        }
        lastPull=out[0].updated_at;setNet('ok');
        return ping();
      });
   });
}
function schedulePush(){
  if(pushT)clearTimeout(pushT);
  setNet('work');
  pushT=setTimeout(function(){pushT=null;push();},900);
}

/* перехватываем touch(): любое изменение уходит на сервер */
var touchBase=touch;
touch=function(){ touchBase(); if(ONLINE)schedulePush(); };

/* ── версии ── */
function saveVersion(note){
  return sbFetch('trip_versions',{method:'POST',rep:true,
    body:[{trip_id:TRIP_ID,data:S,author:(S.ui&&S.ui.me)?person(S.ui.me).name:'',note:note||''}]})
   .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}
function listVersions(){
  return sbFetch('trip_versions?trip_id=eq.'+TRIP_ID+'&select=id,author,note,created_at&order=created_at.desc&limit=30')
   .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});
}
function loadVersion(id){
  return sbFetch('trip_versions?id=eq.'+id+'&select=data')
   .then(function(r){return r.json();});
}
function delVersion(id){
  return sbFetch('trip_versions?id=eq.'+id,{method:'DELETE'});
}
function fmtWhen(iso){
  var d=new Date(iso);
  var mm=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return d.getDate()+' '+mm[d.getMonth()]+', '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
}
function versionsSheet(){
  sheet(function(c,close){
    c.appendChild(el('h3',null,'Версии на сервере'));
    c.appendChild(el('p',null,'Снимок текущего состояния можно сохранить и вернуться к нему позже.'));
    var mk=el('button','mItem',svg('dl')+'<span>Сохранить версию сейчас</span>');
    mk.onclick=function(){
      close();
      sheet(function(c2,cl2){
        c2.appendChild(el('h3',null,'Что за версия?'));
        var f=el('div','fld');var inp=el('input');inp.placeholder='Например: перед закупкой';f.appendChild(inp);c2.appendChild(f);
        var r=el('div','btnRow');
        var no=el('button',null,'Отмена'),yes=el('button','pri','Сохранить');
        r.appendChild(no);r.appendChild(yes);c2.appendChild(r);
        no.onclick=cl2;
        setTimeout(function(){inp.focus();},80);
        yes.onclick=function(){
          var n=(inp.value||'').trim();
          cl2(); setNet('work');
          saveVersion(n).then(function(){setNet('ok');toast('Версия сохранена.');},
            function(){setNet('err');toast('Не получилось сохранить версию.');});
        };
      });
    };
    c.appendChild(mk);
    var box=el('div');box.appendChild(el('p',null,'Загружаю список…'));
    c.appendChild(box);
    listVersions().then(function(rows){
      box.innerHTML='';
      if(!rows.length){box.appendChild(el('p',null,'Версий пока нет.'));return;}
      rows.forEach(function(v){
        var it=el('button','mItem',svg('file')+'<span>'+esc(fmtWhen(v.created_at))
          +(v.author?(' · '+esc(v.author)):'')+(v.note?('<br><u style="margin:0">'+esc(v.note)+'</u>'):'')+'</span>');
        var dl=el('span');dl.style.cssText='margin-left:auto;color:#A8442E;font-size:12px';dl.textContent='убрать';
        dl.onclick=function(ev){
          ev.stopPropagation();
          if(!isEditor()){needEditor();return;}
          delVersion(v.id).then(function(){it.remove();toast('Версия убрана.');});
        };
        it.appendChild(dl);
        it.onclick=function(){
          if(!isEditor()){needEditor();return;}
          setNet('work');
          loadVersion(v.id).then(function(rr){
            if(!rr.length)return;
            S=normalize(mergeSeed(normalize(rr[0].data),SEED));
            touch();render();close();toast('Вернулись к версии от '+fmtWhen(v.created_at)+'.');
          });
        };
        box.appendChild(it);
      });
    },function(){box.innerHTML='';box.appendChild(el('p',null,'Список не загрузился — нет связи.'));});
  });
}

/* ── погода из Open-Meteo ── */
var WX={0:'Ясно',1:'В основном ясно',2:'Переменная облачность',3:'Облачно',45:'Туман',48:'Туман с изморозью',
 51:'Слабая морось',53:'Морось',55:'Сильная морось',61:'Небольшой дождь',63:'Дождь',65:'Сильный дождь',
 71:'Небольшой снег',73:'Снег',75:'Сильный снег',80:'Кратковр. дождь',81:'Кратковр. дождь',82:'Ливни',
 95:'Гроза',96:'Гроза с градом',99:'Гроза с градом'};
function placeQuery(){
  var p=(S.trip.place||'').split('·')[0].trim();
  return p||'Приозерск';
}
function pad2(n){return ('0'+n).slice(-2);}
function tripDates(){
  var start=new Date(S.trip.start), out=[];
  var n=Math.max(1,(S.weather&&S.weather.days?S.weather.days.length:5));
  for(var i=0;i<n;i++){
    var d=new Date(start.getTime()+i*86400000);
    out.push(d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()));
  }
  return out;
}
/* погода на сегодня — отдельным запросом: диапазон дат в основном запросе относится
   к дням поездки, а «что сейчас за окном» нужно независимо от них */
function fetchToday(pt){
  return fetch('https://api.open-meteo.com/v1/forecast?latitude='+pt.latitude+'&longitude='+pt.longitude
   +'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
   +'&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
   +'&forecast_days=1&timezone=auto')
   .then(function(r){return r.json();})
   .then(function(j){
     var cu=j&&j.current; if(!cu||cu.temperature_2m==null)return null;
     var dd=j.daily, pp=(dd&&dd.precipitation_probability_max)?dd.precipitation_probability_max[0]:null;
     return {
       t:Math.round(cu.temperature_2m),
       feels:(cu.apparent_temperature!=null)?Math.round(cu.apparent_temperature):null,
       prec:(WX[cu.weather_code]||'—')+(pp!=null?(' ('+pp+' %)'):''),
       wind:Math.round((cu.wind_speed_10m||0)/3.6)+' м/с',
       hi:(dd&&dd.temperature_2m_max)?Math.round(dd.temperature_2m_max[0]):null,
       lo:(dd&&dd.temperature_2m_min)?Math.round(dd.temperature_2m_min[0]):null
     };
   },function(){return null;});
}
function refreshWeather(silent){
  var q=placeQuery();
  setNet('work','погода…');
  return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&format=json&name='+encodeURIComponent(q))
   .then(function(r){return r.json();})
   .then(function(g){
     if(!g.results||!g.results.length)throw new Error('место не найдено');
     var pt=g.results[0], ds=tripDates();
     S.trip.lat=pt.latitude;S.trip.lon=pt.longitude;
     return fetch('https://api.open-meteo.com/v1/forecast?latitude='+pt.latitude+'&longitude='+pt.longitude
      +'&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max'
      +'&timezone=auto&start_date='+ds[0]+'&end_date='+ds[ds.length-1])
      .then(function(r){return r.json();})
      .then(function(f){return fetchToday(pt).then(function(td){return {pt:pt,f:f,ds:ds,today:td};});});
   })
   .then(function(o){
     var d=o.f&&o.f.daily;
     /* даже если до поездки ещё далеко и прогноза по дням нет, сегодняшнюю погоду сохраняем */
     if(o.today){S.weather.today=o.today;S.weather.ts=Date.now();
       S.weather.updated=fmtWhen(new Date().toISOString());}
     if(!d||!d.time||!d.time.length){
       if(o.today){touch();renderSec('home');setNet('ok');
         if(!silent)toast('Погода на сегодня обновлена. Прогноза на дни поездки пока нет — они дальше двух недель.');
         return;}
       throw new Error('прогноза на эти даты пока нет');
     }
     var WD=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
     var days=d.time.map(function(iso,i){
       var dt=new Date(iso+'T12:00:00');
       var wc=d.weathercode[i];
       var pp=d.precipitation_probability_max?d.precipitation_probability_max[i]:null;
       return {i:'w'+(i+1),d:pad2(dt.getDate())+'.'+pad2(dt.getMonth()+1),wd:WD[dt.getDay()],
         day:Math.round(d.temperature_2m_max[i]),night:Math.round(d.temperature_2m_min[i]),
         prec:(WX[wc]||'—')+(pp!=null?(' ('+pp+' %)'):''),
         wind:Math.round(d.windspeed_10m_max[i]/3.6)+' м/с',
         means:(S.weather.days[i]&&S.weather.days[i].means)||''};
     });
     S.weather.days=days;
     S.weather.updated=fmtWhen(new Date().toISOString());
     S.weather.ts=Date.now();
     S.weather.src='Прогноз Open-Meteo для «'+o.pt.name+'» ('+o.pt.latitude.toFixed(2)+', '
       +o.pt.longitude.toFixed(2)+'), обновлён '+S.weather.updated+'.';
     touch();renderSec('home');
     setNet('ok','погода обновлена');
     setTimeout(function(){setNet('ok');},2000);
     if(!silent)toast('Прогноз обновлён по месту «'+o.pt.name+'».');
   })
   .catch(function(e){
     setNet('ok');
     if(!silent)toast('Погода не обновилась: '+(e&&e.message?e.message:'нет связи')+'.');
   });
}
/* ── погода обновляется сама ──
   Раз в полчаса — свежие цифры. Тянет только тот, у кого они устарели: остальные получат
   их обычной синхронизацией и второй раз в Open-Meteo не пойдут. */
var WX_EVERY=30*60*1000, wxBusy=false;
function weatherStale(){
  var ts=(S.weather&&S.weather.ts)||0;
  return (Date.now()-ts)>WX_EVERY;
}
function weatherAuto(force){
  if(wxBusy||!navigator.onLine)return;
  if(document.hidden&&!force)return;      /* в фоне не ходим в сеть без нужды */
  if(!weatherStale())return;
  wxBusy=true;
  refreshWeather(true).then(function(){wxBusy=false;},function(){wxBusy=false;});
}

/* ── скачать офлайн-копию / загрузить офлайн-файл ── */
function downloadOffline(){
  if(inApp()){                       /* во встроенном браузере файл «скачается» в никуда */
    sheet(function(c,close){
      c.appendChild(el('h3',null,'Здесь файл не сохранится'));
      c.appendChild(el('p',null,'Это встроенный браузер мессенджера — он делает вид, что скачал файл, '
        +'но найти его потом негде. Открой сборный лист в Safari: «⋯» внизу справа → «Открыть в Safari».'));
      var b=el('button','mItem',svg('link')+'<span>Скопировать адрес</span>');
      b.onclick=function(){close();copyHere();};
      c.appendChild(b);
      var r=el('div','btnRow');var ok=el('button','pri','Понятно');
      r.appendChild(ok);c.appendChild(r);ok.onclick=close;
    });
    return;
  }
  refreshWeather(true).then(function(){ saveFile(); });
}
function copyHere(){
  var url=location.href;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){toast('Адрес скопирован.');},function(){copyOld(url);});
  } else if(copyOld(url))toast('Адрес скопирован.');
}
/* инструкция «поставить на телефон» — на айфоне это единственный рабочий офлайн */
function offlineSheet(){
  sheet(function(c,close){
    c.appendChild(el('h3',null,'Работать без интернета'));
    if(standalone()){
      c.appendChild(el('p',null,'Приложение уже стоит на экране «Домой». Оно открывается и работает '
        +'без сети: правки живут в телефоне, а как появится интернет — сами уезжают на сервер.'));
    } else {
      var ios=/iPhone|iPad|iPod/.test(navigator.userAgent||'');
      c.appendChild(el('p',null,ios
        ? 'На айфоне: открой этот адрес в Safari, нажми «Поделиться» внизу, пролистай до пункта '
          +'«На экран «Домой»» и добавь. Появится значок с елью — из него сборный лист открывается '
          +'и работает без интернета.'
        : 'В браузере телефона открой меню и выбери «Добавить на главный экран». '
          +'Приложение будет открываться и работать без интернета.'));
      c.appendChild(el('p',null,'Скачанный файл для этого не годится: айфон открывает такие файлы '
        +'в просмотрщике, где скрипты выключены, и виден только серый экран «Загружаю сборный лист…». '
        +'Файл остаётся резервной копией и способом перекинуть данные на компьютер.'));
      if(inApp()){
        var b=el('button','mItem',svg('link')+'<span>Скопировать адрес для Safari</span>');
        b.onclick=function(){close();copyHere();};
        c.appendChild(b);
      }
    }
    var r=el('div','btnRow');var ok=el('button','pri','Понятно');
    r.appendChild(ok);c.appendChild(r);ok.onclick=close;
  });
}
function uploadOffline(){ document.getElementById('fileIn').click(); }

/* ── кто пришёл по ссылке ── */
function applyUrlUser(){
  var m=(location.search||'').match(/[?&]u=([^&]*)/);
  if(!m)return;
  var id=decodeURIComponent(m[1]).replace(/\+/g,' ').trim().toLowerCase();
  var mk=(location.search||'').match(/[?&]k=([^&]*)/);
  var key=mk?decodeURIComponent(mk[1]).trim():'';
  var found=null;
  S.people.forEach(function(p){
    if(p.id===id||(p.slug||'').toLowerCase()===id||(p.name||'').toLowerCase()===id)found=p;
  });
  if(!found)return;
  S.ui.me=found.id;
  if(key)urlAuth={id:found.id,key:key};
}

/* ── меню «⋯»: онлайн-пункты ── */
function mountMenu(){
  var btn=document.getElementById('bMenu');
  if(!btn)return;
  btn.onclick=function(){
    sheet(function(c,close){
      c.appendChild(el('h3',null,'Ещё'));
      var me=meP();
      c.appendChild(el('p',null,me?('Ты — '+me.name+' · '+permNameOf(me)):'Ты не выбран — открой «Экипаж» и выбери себя.'));
      var items=[];
      /* офлайн-копию снимает и возвращает обратно только владелец: файл — это слепок всей поездки */
      if(isChief()){
        var i0=el('button','mItem',svg('dl')+'<span>Скачать офлайн-копию</span><u>с сегодняшней погодой</u>');
        i0.onclick=function(){close();downloadOffline();};
        var i1=el('button','mItem',svg('file')+'<span>Загрузить офлайн-файл обратно</span><u>правки из скачанного файла вернутся в онлайн</u>');
        i1.onclick=function(){close();uploadOffline();};
        items.push(i0,i1);
      }
      var i2=el('button','mItem',svg('clock')+'<span>Версии на сервере</span>');
      i2.onclick=function(){close();versionsSheet();};
      var i3=el('button','mItem',svg('cloud')+'<span>Обновить прогноз погоды</span>');
      i3.onclick=function(){close();refreshWeather();};
      var i4=el('button','mItem',svg('txt')+'<span>Экспорт в текст для Телеграма</span>');
      i4.onclick=function(){close();exportText();};
      var i8=el('button','mItem',svg('dl')+'<span>Работать без интернета</span><u>'
        +(standalone()?'приложение уже на телефоне':'поставить на экран «Домой»')+'</u>');
      i8.onclick=function(){close();offlineSheet();};
      items.push(i2,i3,i4,i8);
      var i5=el('button','mItem',svg('theme')+'<span>Тема</span><u>'+themeName()+'</u>');
      i5.onclick=function(){close();themeSheet();};
      items.push(i5);
      if(isChief()){
        var i6=el('button','mItem',svg('link')+'<span>Ссылки для экипажа</span><u>каждому своя</u>');
        i6.onclick=function(){close();linksSheet();};
        items.push(i6);
      }
      items.forEach(function(x){c.appendChild(x);});
      if(isEditor()){
        var i7=el('button','mItem dang',svg('trash')+'<span>Сбросить все отметки</span>');
        i7.onclick=function(){close();confirmReset();};
        c.appendChild(i7);
      }
    });
  };
}
function permNameOf(p){
  var e=permOf(p);
  return e==='chief'?'владелец':e==='editor'?'редактор':'участник';
}
function linksSheet(){
  sheet(function(c){
    c.appendChild(el('h3',null,'Ссылки для экипажа'));
    c.appendChild(el('p',null,'У каждого своя ссылка: она выбирает его в списке и даёт его права. '
      +'Тап по строке — ссылка в буфере. Поменяешь человеку права — ссылка сменится, старая перестанет работать.'));
    S.people.forEach(function(p){
      var url=linkFor(p);
      var it=el('button','mItem','<span>'+esc(p.name)+' · '+permName(p)+'<br><u style="margin:0;font-size:11.5px;word-break:break-all">'+esc(url)+'</u></span>');
      it.insertBefore(document.createRange().createContextualFragment(avaHtml(p)),it.firstChild);
      var av=it.querySelector('.av'); if(av)av.style.cssText+=';width:26px;height:26px;font-size:12px';
      it.onclick=function(){copyLink(p);};
      c.appendChild(it);
    });
  });
}

/* ── Realtime: сервер сам сообщает об изменениях ──
   Разговариваем с Supabase Realtime напрямую по WebSocket (протокол Phoenix): SDK с CDN не берём,
   иначе файл перестанет быть самодостаточным, а офлайн-сборка — собираться из того же исходника.
   Подписываемся не на сам документ (он весит под мегабайт — гонять его в каждом событии накладно
   и упирается в лимит payload), а на маленькую таблицу-сигнал trip_pings: пришло событие —
   забираем документ обычным запросом. Пока событий не было, работает частый опрос; после — редкий.
   На сервере нужно один раз выполнить SQL из README (таблица trip_pings + публикация). */
var rtSock=null, rtJoined=false, rtLive=false, rtRef=0, rtBeat=null, rtRetry=0, rtWait=null, myPing='';
function rtSend(m){try{rtSock.send(JSON.stringify(m));}catch(e){}}

/* ── кто сейчас в документе ──
   Присутствие того же канала: каждый сообщает, кто он, и все видят список. Фотографии не шлём —
   они у всех и так есть, по сети идёт только идентификатор. */
var whoNow={};
function rtTrack(){
  var me=meP();
  if(me){whoNow[me.id]=me.name;paintWho();}   /* себя показываем сразу, не дожидаясь эха */
  if(!rtSock||rtSock.readyState!==1)return;
  rtSend({topic:'realtime:pings',event:'presence',ref:String(++rtRef),payload:{
    type:'presence',event:'track',
    payload:{id:me?me.id:'guest',name:me?me.name:'гость'}}});
}
function presenceFrom(state){
  var out={},k,metas,i;
  for(k in state){
    if(!Object.prototype.hasOwnProperty.call(state,k))continue;
    metas=(state[k]&&state[k].metas)||[];
    for(i=0;i<metas.length;i++){
      if(metas[i]&&metas[i].id)out[metas[i].id]=metas[i].name||'';
    }
  }
  return out;
}
function mountWho(){
  var hdr=document.querySelector('.hdrIn');
  if(!hdr||document.getElementById('whoOn'))return;
  var w=document.createElement('div');
  w.id='whoOn';w.className='whoOn';
  hdr.insertBefore(w,hdr.querySelector('#bSearch'));
  w.onclick=whoSheet;
}
function whoIds(){
  var ids=[],k;
  for(k in whoNow)if(Object.prototype.hasOwnProperty.call(whoNow,k)&&k!=='guest')ids.push(k);
  return ids;
}
function paintWho(){
  var box=document.getElementById('whoOn');
  if(!box)return;
  var meNow=meP();
  if(meNow)whoNow[meNow.id]=meNow.name;   /* сам всегда в списке, что бы ни прислал сервер */
  var ids=whoIds();
  while(box.firstChild)box.removeChild(box.firstChild);
  box.style.display=ids.length?'':'none';
  ids.slice(0,3).forEach(function(id){
    var p=person(id), av=document.createElement('span');
    av.className='whoAv';
    av.title=p.name+' сейчас здесь';
    av.style.backgroundColor=p.color;
    if(p.photo)av.style.backgroundImage='url('+p.photo+')';
    else av.textContent=p.ini;
    box.appendChild(av);
  });
  if(ids.length>3){
    var more=document.createElement('b');
    more.textContent='+'+(ids.length-3);
    box.appendChild(more);
  }
  Array.prototype.slice.call(document.querySelectorAll('.crewPhoto')).forEach(function(c){
    var id=c.getAttribute('data-pid');
    c.classList.toggle('isOn',!!(id&&whoNow[id]));
  });
}
function whoSheet(){
  sheet(function(c){
    c.appendChild(el('h3',null,'Кто сейчас здесь'));
    c.appendChild(el('p',null,'Список обновляется сам: человек появляется, когда открывает сборный лист по своей ссылке.'));
    var any=false;
    S.people.forEach(function(p){
      var on=!!whoNow[p.id];
      if(on)any=true;
      var it=el('div','mItem'+(on?' on':''));
      it.appendChild(document.createRange().createContextualFragment(avaHtml(p)));
      var av=it.querySelector('.av');if(av)av.style.cssText+=';width:30px;height:30px;font-size:13px;border-radius:8px';
      var nm=document.createElement('span');
      nm.textContent=p.name+' · '+permName(p);
      var st=document.createElement('u');
      st.textContent=on?'здесь':'нет';
      it.appendChild(nm);it.appendChild(st);
      c.appendChild(it);
    });
    if(!any)c.appendChild(el('p',null,'Кроме тебя сейчас никого.'));
  });
}
function rtStop(){
  if(rtBeat){clearInterval(rtBeat);rtBeat=null;}
  if(rtSock){try{rtSock.onclose=null;rtSock.close();}catch(e){}rtSock=null;}
  rtJoined=false;
}
function rtConnect(){
  if(!window.WebSocket)return;
  if(rtSock&&(rtSock.readyState===0||rtSock.readyState===1))return;
  if(rtWait){clearTimeout(rtWait);rtWait=null;}
  var url=SB.url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SB.key)+'&vsn=1.0.0';
  try{rtSock=new WebSocket(url);}catch(e){return;}
  rtSock.onopen=function(){
    rtRef=0;
    var meNow=meP();
    rtSend({topic:'realtime:pings',event:'phx_join',ref:String(++rtRef),payload:{config:{
      /* без enabled сервер не присылает presence_state — видно было бы только себя */
      broadcast:{self:false},
      presence:{key:(meNow?meNow.id:'guest')+'_'+Math.floor(Math.random()*1e6),enabled:true},
      postgres_changes:[{event:'*',schema:'public',table:'trip_pings',filter:'trip_id=eq.'+TRIP_ID}]},
      access_token:SB.key}});
    rtBeat=setInterval(function(){
      if(!rtSock||rtSock.readyState!==1)return;
      rtSend({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++rtRef)});
    },25000);
  };
  rtSock.onmessage=function(ev){
    var m;try{m=JSON.parse(ev.data);}catch(e){return;}
    if(m.event==='phx_reply'&&m.payload&&m.payload.status==='ok'&&!rtJoined){
      rtJoined=true;rtRetry=0;rtTrack();
    }
    if(m.event==='presence_state'){
      whoNow=presenceFrom(m.payload||{});
      var meS=meP();if(meS)whoNow[meS.id]=meS.name;
      paintWho();return;
    }
    if(m.event==='presence_diff'){
      var d2=m.payload||{}, k2;
      var leaves=presenceFrom(d2.leaves||{}), joins=presenceFrom(d2.joins||{});
      for(k2 in leaves)if(Object.prototype.hasOwnProperty.call(leaves,k2))delete whoNow[k2];
      for(k2 in joins)if(Object.prototype.hasOwnProperty.call(joins,k2))whoNow[k2]=joins[k2];
      paintWho();return;
    }
    if(m.event!=='postgres_changes')return;
    rtLive=true;
    var d=m.payload&&m.payload.data, rec=d&&(d.record||d['new']);
    if(rec&&rec.updated_at&&rec.updated_at===myPing)return;   /* эхо собственной записи */
    pull(false);
  };
  rtSock.onerror=function(){try{rtSock.close();}catch(e){}};
  rtSock.onclose=function(){
    rtJoined=false;
    if(rtBeat){clearInterval(rtBeat);rtBeat=null;}
    var wait=Math.min(30000,2000*Math.pow(2,rtRetry++));
    rtWait=setTimeout(rtConnect,wait);
  };
}

/* ── шапка в онлайне: присутствие, поиск и тема ──
   «Сохранить файл» дублируется пунктом «Скачать офлайн-копию» в «⋯», а аватарка «кто заполняет»
   в онлайне не нужна: личность даёт ссылка, чужие сборы открываются из карточек экипажа.
   Стиль вставляется отдельным тегом — при сохранении офлайн-файла он вычищается, и в офлайне
   обе кнопки остаются на месте. */
function mountHdrTrim(){
  var st=document.createElement('style');
  st.id='hdrTrim';
  st.textContent='#bSave,#bMe{display:none!important}';
  document.head.appendChild(st);
}

/* ── старт онлайна ── */
(function startOnline(){
  mountSyncBar(); mountWho(); mountMenu(); mountHdrTrim(); mountPwa(); applyUrlUser(); applyAuth(); render(); paintWho();
  setNet('work','подключаюсь…');
  pull(false).then(function(){weatherAuto(true);});   /* на старте погоду берём сразу */
  rtConnect();
  var tick=0;
  setInterval(function(){
    if(document.hidden)return;
    tick++;
    /* сокет живой — опрашиваем раз в минуту, иначе каждые 8 секунд */
    if(rtLive&&rtJoined){ if(tick%8===0)pull(false); }
    else if(tick%2===0)pull(false);
    if(tick%75===0)weatherAuto();          /* раз в пять минут проверяем, не устарела ли погода */
  },4000);
  window.addEventListener('online',function(){setNet('work');rtConnect();pull(false);});
  window.addEventListener('offline',function(){setNet('off','нет сети — правки в браузере');});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden)return;
    if(!rtSock||rtSock.readyState>1)rtConnect();
    pull(false);weatherAuto();
  });
})();
