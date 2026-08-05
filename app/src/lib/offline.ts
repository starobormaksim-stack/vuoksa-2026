/**
 * Офлайн-копия одним файлом — и работа прямо в ней.
 *
 * ─── Как это работает словами ───
 *
 * Рядом с сайтом лежит собранный самодостаточный HTML (весь код, шрифты и значок
 * внутри, ни одной внешней загрузки). Нажали «Скачать офлайн-копию» — мы забираем
 * этот файл, вшиваем в него ТЕКУЩИЙ документ отдельной строкой и отдаём на
 * скачивание. Получается лист на сегодня, который открывается двойным щелчком
 * без интернета и без сервера.
 *
 * ─── Что добавлено 04.08.2026: копия стала рабочей ───
 *
 * Раньше копия была снимком «только посмотреть»: правки в ней делались, но при
 * следующем открытии файла вшитый снимок снова перебивал всё, что человек успел
 * наменять. Теперь в файл вшиты три маленьких скрипта:
 *
 *   `pine-doc`  — только данные строкой base64 (в base64 не бывает ни «меньше»,
 *                 ни разделителей строк, поэтому разметку данными не сломать);
 *   `pine-boot` — решает, что показать: вшитый снимок или более свежие правки
 *                 из хранилища этого файла. Он же наглухо закрывает сеть: копия
 *                 не имеет права ни спросить сервер, ни — тем более — записать
 *                 туда что-нибудь. Правки живут только здесь, и это обещание
 *                 должно быть выполнено кодом, а не надеждой;
 *   `pine-keep` — снимает чистую заготовку файла ДО того, как приложение начало
 *                 рисовать. Из неё делается «Сохранить копию заново»: заготовка
 *                 плюс сегодняшние данные — и это новый рабочий файл. Он же
 *                 рисует полоску, которая словами объясняет, где человек находится.
 *
 * Обратная сторона — store.ts: при старте он смотрит `window.__PINE_DOC__` и,
 * если там что-то есть, берёт документ оттуда. Этот договор не менялся.
 */

import { toast } from 'sonner'
import type { State } from './types.ts'
import { docKey } from './trips.ts'
import { fmtDate } from '../format.ts'

/** Имя офлайн-сборки рядом с index.html (его кладёт publish-v2.mjs). */
const OFFLINE_FILE = 'Вуокса-2026.html'

/** Что скрипт `pine-boot` рассказывает приложению о файле, в котором оно живёт. */
interface OfflineInfo {
  /** день, которым помечен снимок («4 августа 2026») */
  savedAt: string
  /** браузер разрешил этому файлу хранить данные */
  storage: boolean
}

/** Окно вместе с тем, что вписали в него вшитые скрипты. */
interface OfflineWindow extends Window {
  __PINE_OFFLINE__?: OfflineInfo
  __PINE_DOC__?: unknown
  __PINE_HTML__?: string
  /** ключ хранилища той поездки, чья это копия (см. docScript) */
  __PINE_KEY__?: string
}

function win(): OfflineWindow | null {
  return typeof window === 'undefined' ? null : (window as OfflineWindow)
}

/** Это офлайн-копия: файл скачали и открыли двойным щелчком. */
export function isOfflineCopy(): boolean {
  const w = win()
  if (!w) return false
  if (w.__PINE_OFFLINE__) return true
  if (w.__PINE_DOC__) return true
  return location.protocol === 'file:'
}

/** Что известно про офлайн-копию. Вне копии — `null`. */
export function offlineInfo(): OfflineInfo | null {
  const w = win()
  return w?.__PINE_OFFLINE__ ?? null
}

/* ─────────── вшиваемые скрипты ─────────── */

/**
 * Скрипт-загрузчик. Обычный (не модуль), поэтому выполняется прямо при разборе
 * разметки — раньше кода приложения, и приложение застаёт мир уже готовым.
 *
 * Написан нарочито просто и без новых возможностей языка: он попадает в файл,
 * который могут открыть на старом телефоне, где обновлять браузер уже некому.
 */
const BOOT = `(function(){
var W=window;
var info={savedAt:W.__PINE_SAVED__||'',storage:false};
W.__PINE_OFFLINE__=info;
function external(u){var s=String(u||'').toLowerCase();
return s.indexOf('http:')===0||s.indexOf('https:')===0||s.indexOf('ws:')===0||s.indexOf('wss:')===0||s.indexOf('//')===0}
function deny(){return new Error('Офлайн-копия не выходит в сеть')}
var f=W.fetch;
if(f)W.fetch=function(input,init){var u=typeof input==='string'?input:(input&&input.url)||'';
if(external(u))return Promise.reject(deny());return f.call(W,input,init)};
W.WebSocket=function(){throw deny()};
try{var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){if(external(u))throw deny();return xo.apply(this,arguments)}}catch(e){}
var doc=null;
try{var b=W.__PINE_B64__||'';
if(b)doc=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b),function(c){return c.charCodeAt(0)})))}catch(e){}
try{localStorage.setItem('flops.probe','1');localStorage.removeItem('flops.probe');info.storage=true}catch(e){}
if(info.storage){try{var raw=localStorage.getItem(W.__PINE_KEY__||'flops.doc');
if(raw){var mine=JSON.parse(raw);
if(mine&&mine.trip&&mine.people&&mine.people.length){
if(!doc||String(mine.updatedAt||'')>=String(doc.updatedAt||''))doc=mine}}}catch(e){}}
if(doc)W.__PINE_DOC__=doc;
try{var d=document.getElementById('pine-doc');if(d)d.textContent=''}catch(e){}
W.__PINE_B64__='';W.__PINE_SAVED__='';
})()`

/*
 * ✅ ЗАКРЫТО 05.08.2026: копия непервой поездки и ключ хранилища (У-62).
 *
 * Было: загрузчик читал `flops.doc` — ключ поездки по умолчанию, — а у всякой
 * другой поездки ключ свой, `flops.doc.<поездка>`. Копия второй поездки
 * показала бы документ первой как свой.
 *
 * ⛔ Поменять здесь одно только ЧТЕНИЕ было ловушкой, и её пробовали 05.08.2026:
 * внутри скачанного файла нет ни `?trip=`, ни `flops.trip` (адрес `file:`),
 * поэтому приложение считает поездку первой и ПИШЕТ в `flops.doc`. Копия
 * переставала находить собственные правки и молча откатывалась на вшитый
 * снимок — настоящая потеря работы вместо гипотетического чтения чужого.
 *
 * Стало: пара. Загрузчик читает `W.__PINE_KEY__` (вшивается ниже, в `docScript`),
 * а `docKey()` в `lib/trips.ts` отдаёт приложению то же имя — значит копия и
 * читает, и пишет по одному ключу. Старая копия без `__PINE_KEY__` ведёт себя
 * ровно как прежде: `||'flops.doc'`.
 */

/**
 * Скрипт-хранитель. Стоит в самом конце тела: разметка уже разобрана целиком,
 * а код приложения (он модуль, а значит отложенный) ещё не выполнялся. Ровно
 * в этот миг документ — чистая заготовка без данных и без следов работы.
 *
 * Он же рисует полоску-объяснение. Полоска ставится ПОСЛЕ снятия заготовки,
 * иначе в следующей копии их стало бы две, потом три и так далее.
 */
const KEEP = `(function(){
try{window.__PINE_HTML__='<!doctype html>'+document.documentElement.outerHTML}catch(e){}
try{
var info=window.__PINE_OFFLINE__||{};
var t=['Это офлайн-копия листа'+(info.savedAt?' от '+info.savedAt:'')+'.',
'Правки сохраняются только в этом файле — в общий лист они не уходят.'];
t.push(info.storage
?'Чтобы не потерять работу, время от времени сохраняйте копию заново через меню «\\u22EF» в шапке.'
:'Браузер запретил этому файлу хранить данные: правки исчезнут вместе со вкладкой. Сохраните копию заново через меню «\\u22EF» в шапке.');
t.push('Карта без интернета не рисуется — вместо неё показаны координаты точек.');
var box=document.createElement('div');
box.id='pine-offline-note';
box.setAttribute('role','status');
box.style.cssText='margin:0;padding:12px 16px;background:var(--zebra);color:var(--ink);border-bottom:1px solid var(--line);font-size:13px;line-height:18px;text-align:center';
box.textContent=t.join(' ');
document.body.insertBefore(box,document.body.firstChild);
}catch(e){}
})()`

/* ─────────── сборка файла ─────────── */

/** Документ в base64 (utf-8). Без spread: документ бывает под сотню килобайт. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  }
  return btoa(bin)
}

/*
 * Слово «конец скрипта» нигде не написано целиком — ни здесь, ни в поиске ниже.
 * Этот файл сам попадает внутрь тега script офлайн-сборки, и целая такая
 * последовательность оборвала бы разметку прямо посреди кода приложения.
 */
const OPEN = '<scr' + 'ipt'
const CLOSE = '</scr' + 'ipt>'
const DOC_OPEN = OPEN + ' id="pine-doc">'

/**
 * ⚠️ Разметку ищем ТОЛЬКО с конца — `lastIndexOf`, никогда `indexOf`.
 *
 * Офлайн-сборка — один файл, и весь код приложения лежит в нём же, внутри тега
 * script в шапке. А в коде есть этот самый файл со строками «конец шапки»
 * и «конец тела». Поиск с начала находил их РАНЬШЕ настоящих — и вшивал данные
 * в середину чужой строки, обрывая код приложения там же, где начинал.
 * Копия скачивалась, открывалась белым экраном и молчала. Найдено 04.08.2026.
 *
 * Настоящие закрывающие теги — последние в файле, потому что стилей и тела
 * после них уже нет. На это и опираемся.
 */
const HEAD_END = '</head>'
const BODY_END = '</body>'

/** Разметка скрипта с данными: строка base64, дата снимка и ключ хранилища. */
function docScript(S: State, savedAt: string): string {
  const b64 = toBase64(JSON.stringify(S))
  return (
    `${OPEN} id="pine-doc">window.__PINE_SAVED__=${JSON.stringify(savedAt)};` +
    `window.__PINE_KEY__=${JSON.stringify(docKey())};` +
    `window.__PINE_B64__="${b64}"${CLOSE}`
  )
}

/**
 * Положить в заготовку сегодняшние данные.
 *
 * Заготовка бывает двух видов, и разница между ними — вся суть «Сохранить копию
 * заново»: у свежей сборки с сайта скриптов ещё нет, и мы вшиваем все три;
 * у заготовки, снятой внутри копии, они уже стоят, и менять надо только данные.
 * Иначе с каждым сохранением файл обрастал бы вторым, третьим и десятым слоем.
 *
 * Вынесено наружу нарочно: это чистое преобразование строки, и его можно
 * прогнать проверкой в Node, не поднимая браузера.
 */
export function offlineHtml(html: string, S: State, savedAt: string): string {
  const fresh = docScript(S, savedAt)

  /* Хвост файла — всё после настоящего конца шапки. Там коротко: тело страницы
     и наши три скрипта. Только в этом хвосте и ищем — в шапке лежит код
     приложения, и совпадение в нём было бы ложным. */
  const headEnd = html.lastIndexOf(HEAD_END)
  const cut = headEnd < 0 ? 0 : headEnd
  const tail = html.slice(cut)
  const at = tail.lastIndexOf(DOC_OPEN)
  if (at >= 0) {
    const end = tail.indexOf(CLOSE, at)
    if (end > at) {
      return html.slice(0, cut) + tail.slice(0, at) + fresh + tail.slice(end + CLOSE.length)
    }
  }

  /* Все три скрипта ставим в конец тела. Обычный (не модульный) скрипт
     выполняется при разборе разметки, а код приложения — модуль, то есть
     отложенный: он всегда стартует позже. Значит загрузчик успевает
     подготовить документ и закрыть сеть, а хранитель — снять чистую заготовку,
     пока приложение ещё не нарисовало ни строчки. */
  const block =
    fresh + `${OPEN} id="pine-boot">${BOOT}${CLOSE}` + `${OPEN} id="pine-keep">${KEEP}${CLOSE}`
  const bodyEnd = html.lastIndexOf(BODY_END)
  return bodyEnd < 0 ? html + block : html.slice(0, bodyEnd) + block + html.slice(bodyEnd)
}

/**
 * Заготовка файла. В офлайн-копии её снял `pine-keep`, на сайте — забираем
 * соседний файл сборки. Нет ни того, ни другого — честно возвращаем пустоту.
 */
async function template(): Promise<string> {
  const w = win()
  if (w?.__PINE_HTML__) return w.__PINE_HTML__
  const res = await fetch('./' + encodeURIComponent(OFFLINE_FILE), { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.text()
}

/** Имя скачиваемого файла: название поездки и сегодняшняя дата. */
function fileName(S: State, now: Date): string {
  const name = (S.trip.title || 'Поездка').replace(/[\\/:*?"<>|]/g, ' ').trim()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${name} · ${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}.html`
}

/**
 * Отдать файл человеку самым родным для его устройства способом.
 *
 * Заказчик 05.08.2026: «функционал в части сохранения офлайн-версии и скачивания
 * должен быть более, скажем так, нативен и удобен». На телефоне «скачать» —
 * это ссылка с `download`, и файл молча падает в общую папку загрузок: на iOS его
 * потом ищут, а половина людей не находит вовсе. Системный лист «Поделиться»
 * предлагает «Сохранить в Файлы», отправить себе в мессенджер или открыть в Excel —
 * то есть человек сам говорит, куда положить.
 *
 * Порядок honest fallback: устройство листа не умеет — обычное скачивание,
 * как было. Человек закрыл лист сам (`AbortError`) — это не отказ, второй раз
 * навязываться нечем, файл не скачиваем.
 *
 * ⚠️ `navigator.share` требует «живого» нажатия. После долгого `await` Safari
 * иногда считает жест истёкшим и отвечает `NotAllowedError` — тогда уходим
 * на скачивание, а не оставляем человека без файла (постулат 5).
 */
export async function deliver(data: BlobPart, name: string, type: string): Promise<void> {
  const nav = typeof navigator === 'undefined' ? null : navigator
  if (nav?.share && nav.canShare) {
    try {
      const file = new File([data], name, { type })
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: name })
        return
      }
    } catch (e) {
      /* Передумал — файл ему не нужен, и скачивать его за спиной незачем. */
      if ((e as { name?: string })?.name === 'AbortError') return
      /* Всё остальное — устройство не смогло; отдаём обычным скачиванием. */
    }
  }
  download(data, name, type)
}

/** Отдать байты браузеру на скачивание. */
export function download(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * ⛔ Убрать из копии ЧУЖИЕ личные ключи, оставив ключ самого человека.
 *
 * Офлайн-копию теперь забирает не только владелец, а вся команда (требование
 * заказчика 05.08.2026). Но копия — это весь документ одним файлом, и в нём лежат
 * `people[].key` всех: участник, открывший скачанный файл в блокноте, получил бы
 * ключ владельца. Ровно так утекала сборка в уроке У-65, и повторять это нельзя.
 *
 * Свой ключ остаётся — иначе в собственной копии человек перестал бы быть собой
 * и потерял бы там свои же полномочия. Владелец получает документ целиком:
 * ссылки команды раздаёт он, и его копия обязана быть полноценной.
 *
 * ⚠️ Копия сети не касается вовсе (`isOfflineCopy()` закрывает синхронизацию),
 * поэтому пустые ключи в неё не попадут обратно на сервер.
 */
export function withoutOthersKeys(S: State, meId: string): State {
  const people = (S.people || []).map((p) => (p.id === meId ? p : { ...p, key: '' }))
  return { ...S, people }
}

/**
 * Прочитать документ из скачанной офлайн-копии.
 *
 * Заказчик 06.08.2026: «и подгрузить, кстати, обратно версию надо иметь
 * возможность — ты раньше делал эту историю, чтобы она работала». В первой
 * версии это был пункт «Загрузить офлайн-файл обратно» (`uploadOffline`
 * в `src/online.js`), и он читал данные из `<script id="seed">`.
 *
 * Во второй версии данные лежат иначе — строкой base64 в `window.__PINE_B64__`
 * внутри скрипта `pine-doc` (см. `docScript` выше), — поэтому и достаём их
 * оттуда. Ничего не сливаем и не пишем: разбор отдельно, слияние отдельно.
 *
 * ⚠️ Ищем с КОНЦА, по той же причине, что и всё остальное в этом файле: строка
 * `__PINE_B64__` встречается и в коде приложения, вшитом в шапку копии. Первое
 * совпадение — это исходник, последнее — настоящие данные.
 */
export function docFromOfflineHtml(html: string): unknown {
  const NAME = '__PINE_B' + '64__="'
  const at = html.lastIndexOf(NAME)
  if (at < 0) throw new Error('в файле нет данных поездки')
  const from = at + NAME.length
  const end = html.indexOf('"', from)
  if (end < 0) throw new Error('данные в файле оборваны')
  const b64 = html.slice(from, end)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  const doc = JSON.parse(new TextDecoder().decode(bytes)) as { gear?: unknown }
  if (!doc || !Array.isArray(doc.gear)) throw new Error('данные не читаются')
  return doc
}

/**
 * Скачать офлайн-копию с текущими данными.
 * Внутри самой копии это «Сохранить копию заново»: заготовка та же, данные свежие.
 *
 * `meId` — чей ключ оставить в файле. Пусто — документ уезжает целиком (владелец).
 */
export async function saveOfflineCopy(S: State, meId = ''): Promise<boolean> {
  const inside = isOfflineCopy()
  try {
    const now = new Date()
    const doc = meId ? withoutOthersKeys(S, meId) : S
    const html = offlineHtml(await template(), doc, fmtDate(now))
    await deliver(html, fileName(S, now), 'text/html;charset=utf-8')
    toast(
      inside
        ? 'Копия сохранена заново — сегодняшние правки уже в ней'
        : 'Копия у вас. Откроется без интернета',
    )
    return true
  } catch {
    toast(
      inside
        ? 'Сохранить копию не вышло — этот файл открыт без заготовки внутри'
        : 'Копию сейчас не забрать — нужен интернет и опубликованная версия',
    )
    return false
  }
}
