import { useEffect, useState } from 'react'
import {
  CloudOff,
  Copy,
  Download,
  Ellipsis,
  Luggage,
  FileSpreadsheet,
  Info,
  Link2,
  LogIn,
  LogOut,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResponsiveSheet, Btn } from '@/components/flops'
import { OwnerLogin } from '@/components/auth/OwnerLogin'
import { useTrip } from '@/store'
import { linkFor, permName } from '@/lib/perm'
import { deliver, isOfflineCopy, offlineInfo, saveOfflineCopy } from '@/lib/offline'
import { tripFileName, tripWorkbook } from '@/lib/export'
import { openTripsList } from '@/lib/trips'
import { currentSession, onAuthChange, signOut, type Session } from '@/lib/auth'
import { BRAND } from './Logo'

/** Тип файла книги Excel — по нему телефон понимает, чем её открывать. */
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Меню «⋯» в шапке.
 *
 * Что кому положено (постулат «не положено — кнопки нет»):
 *   · «Скачать таблицу» и «Скачать офлайн-копию» — всем из команды. Требование
 *     заказчика 05.08.2026: «имеется эта возможность у каждого из участников
 *     команды». Это выгрузка того, что человек и так видит, а не правка;
 *     чужие личные ключи из файла вычищаются (lib/offline.ts);
 *   · «Ссылки команды» — только владельцу, это его полномочия.
 */
export function MoreMenu() {
  const { S, perms } = useTrip()
  const [links, setLinks] = useState(false)
  const [about, setAbout] = useState(false)
  const [login, setLogin] = useState(false)
  const chief = perms.isChief()

  /* Офлайн-копия — файл, скачанный и открытый двойным щелчком. От неё зависят
     и названия пунктов, и то, что написано в карточке «О сервисе». */
  const offline = isOfflineCopy()
  const info = offlineInfo()

  /* Кто вошёл почтой. Это НЕ права: права по-прежнему даёт личная ссылка (`lib/perm.ts`),
     а вход — отдельное подтверждение, что за документом владелец. */
  const [sess, setSess] = useState<Session | null>(currentSession)
  useEffect(() => {
    const off = onAuthChange((s) => {
      setSess(s)
      /* Вошли — шторке входа больше нечего показывать. */
      if (s) setLogin(false)
    })
    return () => {
      off()
    }
  }, [])

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(msg)
    } catch {
      toast('Скопировать не вышло — выделите ссылку и скопируйте вручную')
    }
  }

  /* Книга Excel собирается прямо в браузере (см. lib/xlsx.ts). Молча упасть она
     не имеет права: не собралась — человек должен прочитать об этом словами.
     `deliver` на телефоне открывает системный лист «Поделиться» («Сохранить
     в Файлы», отправить себе), на компьютере — обычное скачивание. */
  const saveSheet = async () => {
    try {
      await deliver(tripWorkbook(S), tripFileName(S), XLSX_TYPE)
      toast('Таблица у вас. Открывается в Excel, Гугл-таблицах и на телефоне')
    } catch {
      toast('Таблицу собрать не вышло — попробуйте ещё раз или обновите страницу')
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Ещё действия"
            className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-zebra hover:text-ink"
          >
            <Ellipsis size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56 border-line bg-surface text-ink">
          {/* Поездок у заказчика будет много («у меня этих поездок будет дофига»),
              и вход в список обязан быть там, где его станут искать. */}
          {!offline && (
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => openTripsList()}>
              <Luggage size={18} strokeWidth={1.75} aria-hidden />
              Мои поездки
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="min-h-11 gap-2"
            onSelect={() => {
              void saveSheet()
            }}
          >
            <FileSpreadsheet size={18} strokeWidth={1.75} aria-hidden />
            Забрать таблицу Excel
          </DropdownMenuItem>
          {chief && (
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setLinks(true)}>
              <Link2 size={18} strokeWidth={1.75} aria-hidden />
              Ссылки команды
            </DropdownMenuItem>
          )}
          {perms.canSaveFile() && (
            <DropdownMenuItem
              className="min-h-11 gap-2"
              onSelect={() => {
                /* Владельцу — документ целиком: ссылки команды раздаёт он.
                   Остальным — со своим ключом и без чужих (lib/offline.ts). */
                void saveOfflineCopy(S, chief ? '' : perms.me)
              }}
            >
              {offline ? (
                <Save size={18} strokeWidth={1.75} aria-hidden />
              ) : (
                <Download size={18} strokeWidth={1.75} aria-hidden />
              )}
              {offline ? 'Сохранить копию заново' : 'Забрать офлайн-копию'}
            </DropdownMenuItem>
          )}
          {sess ? (
            <DropdownMenuItem
              className="min-h-11 gap-2"
              onSelect={() => {
                /* Сеанс гаснет сразу, ещё до ответа сервера, — сообщать можно тут же. */
                void signOut()
                toast('Вы вышли')
              }}
            >
              <LogOut size={18} strokeWidth={1.75} aria-hidden />
              <span className="min-w-0">
                <span className="block">Выйти</span>
                {/* Адрес мог не доехать: в ссылке из письма приезжают только ключи,
                    за личностью ходят отдельным запросом, и он может не ответить. */}
                <span className="block truncate text-micro text-muted">
                  {sess.email || 'Вход подтверждён'}
                </span>
              </span>
            </DropdownMenuItem>
          ) : (
            !offline && (
              <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setLogin(true)}>
                <LogIn size={18} strokeWidth={1.75} aria-hidden />
                Вход владельца
              </DropdownMenuItem>
            )
          )}
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setAbout(true)}>
            <Info size={18} strokeWidth={1.75} aria-hidden />
            О сервисе
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveSheet
        open={links}
        onOpenChange={setLinks}
        title="Ссылки команды"
        subtitle="В ссылке зашиты права. Меняются права — старая ссылка гаснет"
        footer={
          <Btn scale="lg" className="w-full" onClick={() => setLinks(false)}>
            Готово
          </Btn>
        }
      >
        <ul>
          {S.people.map((p) => (
            <li key={p.id} className="border-b border-line/70 py-2 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ink">{p.name}</span>
                  <span className="block text-note text-muted">{permName(p.perm)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Скопировать ссылку: ${p.name}`}
                  onClick={() => copy(linkFor(p), `Ссылка для ${p.name} скопирована`)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-accent-text hover:bg-zebra"
                >
                  <Copy size={20} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              <div className="tnum truncate pb-1 text-micro text-muted">{linkFor(p)}</div>
            </li>
          ))}
        </ul>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={login}
        onOpenChange={setLogin}
        title="Вход владельца"
        subtitle="Ссылка придёт на почту — пароль не нужен"
        footer={
          <Btn tone="secondary" scale="lg" className="w-full" onClick={() => setLogin(false)}>
            Закрыть
          </Btn>
        }
      >
        <OwnerLogin />
      </ResponsiveSheet>

      <ResponsiveSheet
        open={about}
        onOpenChange={setAbout}
        title={BRAND}
        subtitle="Сборный лист поездки"
        footer={
          <Btn scale="lg" className="w-full" onClick={() => setAbout(false)}>
            Понятно
          </Btn>
        }
      >
        {/* Было четыре строки про устройство сервиса. Заказчик 05.08.2026:
            «гигантское количество текста… это лишнее». Осталось то, чего
            человек не увидит сам: правки не затирают друг друга. */}
        <p className="text-body leading-relaxed text-ink">
          Лист общий: правки сливаются по позициям, а не «кто последний, тот и прав».
        </p>
        {offline && (
          <p className="mt-3 flex gap-2 text-note text-ink">
            <CloudOff size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-muted" />
            <span>
              Сейчас открыта офлайн-копия{info?.savedAt ? ` от ${info.savedAt}` : ''}. Она ничего
              не берёт из сети и ничего туда не отправляет: правки остаются в этом файле.
              {info && !info.storage
                ? ' Браузер запретил файлу хранить данные — правки исчезнут вместе со вкладкой, сохраняйте копию заново.'
                : ' Чтобы не потерять работу, время от времени сохраняйте копию заново.'}
            </span>
          </p>
        )}
        <p className="mt-3 text-note text-muted">
          Вы сейчас: {perms.mePerson ? perms.mePerson.name : 'без личной ссылки'} ·{' '}
          {permName(perms.perm)}
        </p>
      </ResponsiveSheet>
    </>
  )
}
