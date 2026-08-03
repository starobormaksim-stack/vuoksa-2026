/* ═══════════ ОНЛАЙН-НАДСТРОЙКА · Supabase + Open-Meteo ═══════════ */
"use strict";
var SB={url:'https://oagonfdnlgqkoosvgaly.supabase.co',
 key:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZ29uZmRubGdxa29vc3ZnYWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTc4NTMsImV4cCI6MjEwMTMzMzg1M30.hpQyHLXKsmGVSTS-pFG66rtM_uF-8kXmj8ituNCvbww'};
var TRIP_ID='vuoksa2026';
ONLINE=true; SAVE_STRIP=['#sync-code','#syncBar'];
var netState='idle', netMsg='', lastPull=0, pushT=null, pulling=false;

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

/* ── чтение и запись ── */
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
     var mine=S.updatedAt||'';
     var theirs=(row.data&&row.data.updatedAt)||'';
     lastPull=row.updated_at;
     if(force||theirs>mine){
       var keepMe=S.ui&&S.ui.me, keepTab=S.ui&&S.ui.tab;
       S=normalize(mergeSeed(normalize(row.data),SEED));
       if(keepMe)S.ui.me=keepMe; if(keepTab)S.ui.tab=keepTab;
       render(); setNet('ok','обновлено с сервера');
       setTimeout(function(){setNet('ok');},2000);
     } else setNet('ok');
   })
   .catch(function(e){pulling=false;setNet('err','нет связи с сервером');});
}
function push(create){
  setNet('work');
  S.author=(S.ui&&S.ui.me)?person(S.ui.me).name:'';
  var body={id:TRIP_ID,data:S,updated_at:new Date().toISOString(),author:S.author};
  return sbFetch('trips',{method:'POST',body:[body],
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'}})
   .then(function(r){
     if(!r.ok)throw new Error('HTTP '+r.status);
     return r.json();
   })
   .then(function(rows){ if(rows&&rows[0])lastPull=rows[0].updated_at; setNet('ok'); })
   .catch(function(e){setNet('err','правки не ушли на сервер');});
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
      .then(function(r){return r.json();}).then(function(f){return {pt:pt,f:f,ds:ds};});
   })
   .then(function(o){
     var d=o.f&&o.f.daily;
     if(!d||!d.time||!d.time.length)throw new Error('прогноза на эти даты пока нет');
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

/* ── скачать офлайн-копию / загрузить офлайн-файл ── */
function downloadOffline(){
  refreshWeather(true).then(function(){ saveFile(); });
}
function uploadOffline(){ document.getElementById('fileIn').click(); }

/* ── роль из ссылки ── */
function applyUrlUser(){
  var m=(location.search||'').match(/[?&]u=([^&]+)/);
  if(!m)return;
  var id=decodeURIComponent(m[1]).toLowerCase();
  var found=null;
  S.people.forEach(function(p){
    if(p.id===id||(p.name||'').toLowerCase()===id)found=p;
  });
  if(found){S.ui.me=found.id;}
}

/* ── меню «⋯»: онлайн-пункты ── */
function mountMenu(){
  var btn=document.getElementById('bMenu');
  if(!btn)return;
  btn.onclick=function(){
    sheet(function(c,close){
      c.appendChild(el('h3',null,'Ещё'));
      var me=meP();
      c.appendChild(el('p',null,me?('Ты — '+me.name+' · '+permName(me)):'Ты не выбран — открой «Экипаж» и выбери себя.'));
      var i0=el('button','mItem',svg('dl')+'<span>Скачать офлайн-копию</span><u>с сегодняшней погодой</u>');
      i0.onclick=function(){close();downloadOffline();};
      var i1=el('button','mItem',svg('file')+'<span>Загрузить офлайн-файл в онлайн</span>');
      i1.onclick=function(){close();uploadOffline();};
      var i2=el('button','mItem',svg('clock')+'<span>Версии на сервере</span>');
      i2.onclick=function(){close();versionsSheet();};
      var i3=el('button','mItem',svg('cloud')+'<span>Обновить прогноз погоды</span>');
      i3.onclick=function(){close();refreshWeather();};
      var i4=el('button','mItem',svg('txt')+'<span>Экспорт в текст для Телеграма</span>');
      i4.onclick=function(){close();exportText();};
      var cur=THEMES.filter(function(x){return x[0]===(S.theme||null);})[0];
      var i5=el('button','mItem',svg('theme')+'<span>Тема</span><u>'+cur[1]+'</u>');
      i5.onclick=function(){
        var ix=THEMES.map(function(x){return x[0];}).indexOf(S.theme||null);
        S.theme=THEMES[(ix+1)%3][0];touch();applyTheme();close();
      };
      var i6=el('button','mItem',svg('user')+'<span>Ссылки для экипажа</span>');
      i6.onclick=function(){close();linksSheet();};
      [i0,i1,i2,i3,i4,i5,i6].forEach(function(x){c.appendChild(x);});
      if(isEditor()){
        var i7=el('button','mItem dang',svg('trash')+'<span>Сбросить все отметки</span>');
        i7.onclick=function(){close();confirmReset();};
        c.appendChild(i7);
      }
    });
  };
}
function linksSheet(){
  sheet(function(c,close){
    c.appendChild(el('h3',null,'Ссылки для экипажа'));
    c.appendChild(el('p',null,'У каждого своя ссылка — она сразу выбирает его в списке и даёт его права. Скинь каждому свою.'));
    var base=location.href.split('?')[0];
    S.people.forEach(function(p){
      var url=base+'?u='+encodeURIComponent(p.id);
      var it=el('button','mItem','<span>'+esc(p.name)+' · '+permName(p)+'<br><u style="margin:0;font-size:11.5px">'+esc(url)+'</u></span>');
      it.insertBefore(document.createRange().createContextualFragment(avaHtml(p)),it.firstChild);
      var av=it.querySelector('.av'); if(av)av.style.cssText+=';width:26px;height:26px;font-size:12px';
      it.onclick=function(){
        var ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);
        ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}
        ta.remove();
        if(!ok&&navigator.clipboard)navigator.clipboard.writeText(url);
        toast('Ссылка для '+p.name+' скопирована.');
      };
      c.appendChild(it);
    });
  });
}

/* ── старт онлайна ── */
(function startOnline(){
  mountSyncBar(); mountMenu(); applyUrlUser();
  setNet('work','подключаюсь…');
  pull(false).then(function(){
    var stamp=(S.weather&&S.weather.updated)||'';
    if(!S.trip.lat||!/\d{2}:\d{2}/.test(stamp))refreshWeather(true);
  });
  setInterval(function(){ if(!document.hidden)pull(false); },4000);
  window.addEventListener('online',function(){setNet('work');pull(false);});
  window.addEventListener('offline',function(){setNet('off','нет сети — правки в браузере');});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)pull(false);});
})();
