import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { SECTIONS, anchorOf, scrollToSection, type SectionDef } from './sections'
import { useTrip } from './store'
import { useTheme } from './theme'
import { useBottomNav } from './navpref'
import { currentSession, onAuthChange, type Session } from './lib/auth'
import { isOfflineCopy } from './lib/offline'
import { personalizeManifest } from './lib/homescreen'
import { jumpToItem, setSectionNav } from './lib/jump'
import { requestUnfold } from './foldpref'
import { askMapPoint } from './lib/mapfocus'
import { closeTripsList, firstStepPerson } from './lib/trips'
import { ClosedList } from './components/auth/ClosedList'
import { OpeningList } from './components/auth/OpeningList'
import { FirstStep } from './components/trips/FirstStep'
import { TripsScreen } from './components/trips/TripsScreen'
import { TopNav } from './components/TopNav'
import { MobileHeader } from './components/MobileHeader'
import { NetNotice } from './components/NetNotice'
import { OfflineWho } from './components/OfflineWho'
import { PermNotice } from './components/PermNotice'
import { BottomNav } from './components/BottomNav'
import { Placeholder } from './components/Placeholder'
import { SearchCommand } from './components/SearchCommand'
import { TripSection } from './components/trip/TripSection'
import { BuySection } from './components/buy/BuySection'
import { Settlement } from './components/buy/Settlement'
import { GearSection } from './components/gear/GearSection'
import { RoadSection } from './components/road/RoadSection'
import { CrewSection } from './components/crew/CrewSection'
import { MenuSection } from './components/menu/MenuSection'
import { StaySection } from './components/stay/StaySection'
import { Toaster } from './components/ui/sonner'

/**
 * Каркас Pine-to-Pine.
 *
 * ─── Единый лендинг (решение заказчика 04.08.2026) ───
 * Разделы больше не подменяют друг друга. Вся поездка — одна длинная страница:
 * разделы идут сверху вниз, прокруткой. Меню (верхнее и нижнее) ничего не переключает,
 * а прокручивает к разделу и подсвечивает тот, что сейчас на экране.
 * Раньше нажатие «Сборы» убирало «Поездку» с глаз, и заказчик справедливо сказал,
 * что так лист поездки не читается: он один, а не шесть отдельных экранов.
 *
 * Активный пункт определяет IntersectionObserver: полоса наблюдения начинается сразу
 * под шапкой и заканчивается на середине экрана, активным считается первый сверху
 * раздел, попавший в эту полосу.
 */
function App() {
  const { S, perms, denied, opened, signIn, entering } = useTrip()
  const { dark, toggle } = useTheme()
  const nav = useBottomNav()
  const [search, setSearch] = useState(false)
  const reduce = useReducedMotion()
  const { active, goTo } = useSectionNav(SECTIONS)

  /* Кто вошёл по почте. От этого зависят два экрана: первый шаг новичка
     и список поездок — оба про личность, а не про содержимое поездки. */
  const [sess, setSess] = useState<Session | null>(currentSession)
  useEffect(() => {
    const off = onAuthChange(setSess)
    return () => {
      off()
    }
  }, [])

  /* Список поездок открывается и адресом `?trips=1`: так на него можно дать ссылку
     и так он остаётся доступен, даже если кнопка не попалась на глаза.
     В офлайн-копии поездок нет вовсе: файл самодостаточен и в сеть не ходит. */
  const офлайн = isOfflineCopy()
  const [trips, setTrips] = useState(
    () => typeof location !== 'undefined' && /[?&]trips=1/.test(location.search),
  )

  /* Переход к разделу знает теперь и общий «плюс»: позиция заводится в своём
     разделе, и человека туда надо увести. Сам переход живёт в `lib/jump.ts`,
     а сюда отдаётся `goTo` — он гасит наблюдателя активного раздела на время
     плавной прокрутки. */
  useEffect(() => {
    setSectionNav(goTo)
    return () => setSectionNav(null)
  }, [goTo])

  /* Ярлык на домашнем экране должен открывать СВОЙ лист, а не общий адрес:
     у приложения с домашнего экрана хранилище своё, и запомненного ключа там
     нет (`lib/homescreen.ts`). Личный манифест собирается в браузере, как только
     человек опознан, и в файл сайта не попадает. В офлайн-копии не нужен:
     она и так самодостаточна. */
  const меня = perms.mePerson
  useEffect(() => {
    if (офлайн) return
    void personalizeManifest(меня)
  }, [меня, офлайн])

  /* Тап по знаку — возврат к началу страницы (и на мобильном, и на десктопе). */
  const goHome = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [reduce])

  /* Ctrl/⌘+K — привычная горячая клавиша поиска на десктопе. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearch((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Пока владелец не назвал себя, показывать поездку рано: лист не смог бы честно
     назвать его ни в одном списке. Участник по личной ссылке сюда не попадает —
     решает firstStepPerson() в lib/trips.ts. */
  const новичок = firstStepPerson(S, perms.mePerson, !!sess)
  if (новичок) return <FirstStep person={новичок} />

  if (trips && !офлайн)
    return (
      <TripsScreen
        onClose={() => {
          /* Метку убираем и из адреса: иначе обновление страницы снова
             вернуло бы человека в список, из которого он только что вышел. */
          closeTripsList()
          setTrips(false)
        }}
      />
    )

  /* ⛔ Лист закрыт от посторонних (требование заказчика 05.08.2026).
     Критерий — «человек ОПОЗНАН», а не «в адресе есть ?k=»: красивая ссылка
     /vuoksa2026/Maks ключа не несёт, он берётся из запомненного в браузере
     (урок У-37). Поэтому смотрим на `perms.authed` — ключ сошёлся с карточкой,
     откуда бы он ни пришёл: из адреса, из памяти браузера или из сеанса владельца.
     ⚠️ Не на `perms.me`: его заполняет ОДНО ИМЯ из пути, а имя посторонний
     наберёт руками. Назвался ≠ опознан.
     Заодно это закрывает дыру «голый адрес = права владельца» (урок У-01):
     до этой правки `myPerm()` при пустом `me` отдавал chief.
     ⛔ Но судить об этом можно только ПОСЛЕ первого чтения с сервера. Заводской сид
     людей не содержит вовсе (`data/seed-base.json`, урок У-65), поэтому в первую
     секунду ключ сверять не с чем и `perms.authed` заведомо ложно. Показать в эту
     минуту «Этот лист закрыт» значит отказать человеку, который всё сделал верно, —
     он прочитает это как поломку и пойдёт просить новую ссылку. До ответа сервера
     на экране `OpeningList`, а решают ворота уже по факту.
     Офлайн-копия сюда не попадает: файл самодостаточен, его скачал владелец,
     и сети у него нет вовсе. */
  /* ⛔ `entering` — человек прямо сейчас входит по ссылке из письма. Пока код
     не обменян на сеанс, любой отказ ложен: чтение уходило бы от общего ключа
     (У-102). Ждём здесь же, тем же экраном, а не показываем «лист закрыт». */
  if (!офлайн && (entering || (!opened && !denied && !perms.authed))) return <OpeningList />
  if (!офлайн && (denied || !perms.authed))
    return <ClosedList denied={denied || perms.stale} signedInAs={signIn.email} />

  return (
    <div className="min-h-svh">
      <TopNav
        sections={SECTIONS}
        active={active}
        onSelect={goTo}
        people={S.people}
        dark={dark}
        onToggleTheme={toggle}
        onSearch={() => setSearch(true)}
        onHome={goHome}
      />
      <MobileHeader
        people={S.people}
        dark={dark}
        onToggleTheme={toggle}
        onSearch={() => setSearch(true)}
        onHome={goHome}
      />

      {/* Отступ снизу считается от высоты нижней панели (`--bottom-nav-h`, ставит
          `navpref.ts`): свёрнутая панель не должна оставлять под собой пустоту.
          Запасное значение в `var()` — на случай, если переменную ещё не поставили:
          это ровно прежние 7rem. */}
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 pb-[calc(var(--bottom-nav-h,7rem)+1.5rem)] lg:px-6 lg:py-8 lg:pb-12">
        {/* ⚠️ Здесь стояли две строки над разделами — «Вы — Макс · владелец» с рядом
            присутствия и кнопка «Мои поездки». Обе убраны 05.08.2026.
            · Личность и присутствие переехали ЗНАКОМ в саму шапку (`PresenceStack`
              variant="chip"): заказчик просил, чтобы это было видно постоянно.
              Словами в полосу меню писать по-прежнему нельзя — урок У-11.
            · «Мои поездки» дословно тем же пунктом уже есть в меню «⋯» — строка
              была вторым органом того же действия и занимала 44 px пустой высоты
              перед обложкой. Заказчик 05.08.2026: «нет никакой лишней информации,
              пустого скроллинга нету».  */}

        {/* Все разделы на странице сразу, каждый — своя секция с якорем.
            `scroll-margin-top` уводит заголовок из-под прилипающей шапки. */}
        <div className="flex flex-col gap-10 lg:gap-14">
          {/* Офлайн-копию открывают и те, кому её скинули: у файла нет ссылки
              с ключом, и без вопроса «кто вы» человек оставался тем, кем копию
              сохранили. Вне копии и после выбора карточка не рисуется. */}
          {офлайн && <OfflineWho />}
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={anchorOf(s.id)}
              aria-label={s.title}
              /* Отступ ровно в высоту шапки — то же число, на котором стоит липкая
                 полоса раздела (--header-h в index.css). Прежние 80/96 px оставляли
                 над полосой пустой зазор при переходе из меню. */
              style={{ scrollMarginTop: 'var(--header-h)' }}
            >
              {s.id === 'trip' ? (
                <TripSection S={S} perms={perms} />
              ) : s.id === 'gear' ? (
                <GearSection />
              ) : s.id === 'buy' ? (
                <BuySection />
              ) : s.id === 'road' ? (
                <RoadSection />
              ) : s.id === 'crew' ? (
                <CrewSection />
              ) : s.id === 'menu' ? (
                <MenuSection />
              ) : s.id === 'stay' ? (
                <StaySection />
              ) : (
                <Placeholder section={s} />
              )}
            </section>
          ))}

          {/* Общий зачёт — САМЫМ ПОСЛЕДНИМ на листе, после всех разделов
              с тратами. Заказчик 08.08.2026: «Почему у тебя взаиморасчёты
              после еды, после закупки идут, а отдельно расчёты по логистике?
              У тебя всё в конце должно считаться… Общее считается в конце,
              грамотно прописано: кто кому что должен». До этого блок стоял
              в конце «Закупки» — перед «Дорогой», то есть зачёт показывался
              раньше половины трат, которые в нём же и посчитаны.
              Экземпляр один (У-53), арифметика прежняя — lib/settle.ts. */}
          <Settlement S={S} me={perms.me} />
        </div>
      </main>

      <BottomNav
        sections={SECTIONS}
        active={active}
        onSelect={goTo}
        open={nav.open}
        onToggle={nav.toggle}
      />
      {/* Точка маршрута — единственная находка, у которой строки в списке нет
          вовсе: её показывает карта, открывая карточку метки (06.08.2026, лента
          точек упразднена). Прыжок `jumpToItem` искал бы `data-hit`, которого
          не существует, и молча ничего не делал — постулат 5. */}
      <SearchCommand
        S={S}
        open={search}
        onOpenChange={setSearch}
        onJump={(section, itemId) => {
          if (section === 'trip' && S.route.some((p) => p.i === itemId)) askMapPoint(itemId)
          else {
            /* Группы по умолчанию свёрнуты (foldpref.ts), а строка внутри
               свёрнутой группы не отрисована — сначала просим раздел
               раскрыть её, иначе прыжок пришёл бы в пустоту (постулат 5). */
            requestUnfold(section, itemId)
            jumpToItem(section, itemId)
          }
        }}
      />
      <NetNotice />
      <PermNotice />
      <Toaster />
    </div>
  )
}

/**
 * Активный раздел и переход к нему.
 *
 * Пока идёт плавная прокрутка, наблюдатель молчит: иначе подчёркивание пробегает
 * по всем разделам, через которые страница пролетает по дороге к нужному.
 */
function useSectionNav(sections: SectionDef[]): {
  active: string
  goTo: (id: string) => void
} {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  /** до какого момента наблюдатель не вмешивается (идёт наша прокрутка) */
  const quiet = useRef(0)

  const goTo = useCallback((id: string) => {
    setActive(id)
    quiet.current = Date.now() + 900
    scrollToSection(id)
  }, [])

  const ids = sections.map((s) => s.id).join('|')
  useEffect(() => {
    const list = ids.split('|').filter(Boolean)

    /**
     * Активным считается последний раздел, чей верх уже ушёл под шапку.
     * Считаем геометрией, а не одним лишь IntersectionObserver: наблюдатель молчит,
     * пока вкладка не рисует кадры (фоновая вкладка, экономия батареи, встроенный
     * браузер Телеграма в момент прокрутки), и подсветка тогда просто застревает.
     * Наблюдатель оставлен вторым будильником — он дёргает тот же расчёт.
     */
    const pick = () => {
      if (Date.now() < quiet.current) return
      /* Дочитали до самого низа — смотрим последний раздел, каким бы коротким он ни был. */
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let hit = list[0]
      if (atBottom) {
        hit = list[list.length - 1]
      } else {
        /* Порог — нижний край прилипающей шапки плюс небольшой запас. */
        const line = 96
        for (const id of list) {
          const el = document.getElementById(anchorOf(id))
          if (el && el.getBoundingClientRect().top <= line) hit = id
        }
      }
      if (hit) setActive((cur) => (cur === hit ? cur : hit))
    }

    const io = new IntersectionObserver(() => pick(), { threshold: [0, 1] })
    list.forEach((id) => {
      const el = document.getElementById(anchorOf(id))
      if (el) io.observe(el)
    })

    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    pick()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
    }
  }, [ids])

  return { active, goTo }
}

export default App
