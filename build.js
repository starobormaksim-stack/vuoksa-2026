// Сборка «Вуокса-2026 · сборный лист».
// Чистый Node, без зависимостей: node build.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const lit = (s, find, repl) => s.split(find).join(repl); // литеральная замена: в данных есть $ и суммы

const template = fs.readFileSync(path.join(SRC, 'app.template.html'), 'utf8');
const seed = fs.readFileSync(path.join(SRC, 'seed.json'), 'utf8').trim();
const hero = fs.readFileSync(path.join(SRC, 'hero-b64.txt'), 'utf8').trim();
const online = fs.readFileSync(path.join(SRC, 'online.js'), 'utf8');

JSON.parse(seed); // падаем сразу, если данные битые

// офлайн-версия
const offline = lit(lit(template, '__SEED__', seed), '__HERO__', hero);
if (offline.includes('__SEED__') || offline.includes('__HERO__')) throw new Error('плейсхолдер не заменён');

// онлайн-версия: модуль синхронизации отдельным скриптом перед закрывающими тегами
const MARK = '</script>\n</body>\n</html>';
if (!offline.includes(MARK)) throw new Error('не найдено место для вставки модуля');
let onlineHtml = lit(offline, MARK, '</script>\n<script id="sync-code">\n' + online + '\n' + MARK);
onlineHtml = lit(onlineHtml, '<title>ВУОКСА · 2026</title>', '<title>Вуокса-2026 · сборный лист</title>');

fs.writeFileSync(path.join(__dirname, 'Вуокса-2026.html'), offline);
fs.writeFileSync(path.join(__dirname, 'index.html'), onlineHtml);

const kb = (s) => Math.round(s.length / 1024) + ' КБ';
console.log('Вуокса-2026.html (офлайн) —', kb(offline));
console.log('index.html (онлайн)     —', kb(onlineHtml));
