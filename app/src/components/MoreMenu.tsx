import { useState } from 'react'
import { Copy, Download, Ellipsis, Info, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResponsiveSheet, Btn } from '@/components/flops'
import { useTrip } from '@/store'
import { linkFor, permName } from '@/lib/perm'
import { saveOfflineCopy } from '@/lib/offline'
import { BRAND } from './Logo'

/**
 * Меню «⋯» в шапке. Ссылки экипажа и офлайн-копию видит только владелец —
 * это его полномочия по модели прав, и у остальных пунктов просто нет в разметке.
 */
export function MoreMenu() {
  const { S, perms } = useTrip()
  const [links, setLinks] = useState(false)
  const [about, setAbout] = useState(false)
  const chief = perms.isChief()

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(msg)
    } catch {
      toast('Скопировать не вышло — выделите ссылку и скопируйте вручную')
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
            <Ellipsis size={21} strokeWidth={1.5} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56 border-line bg-surface text-ink">
          {chief && (
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setLinks(true)}>
              <Link2 size={18} strokeWidth={1.5} aria-hidden />
              Ссылки экипажа
            </DropdownMenuItem>
          )}
          {chief && (
            <DropdownMenuItem
              className="min-h-11 gap-2"
              onSelect={() => {
                void saveOfflineCopy(S)
              }}
            >
              <Download size={18} strokeWidth={1.5} aria-hidden />
              Скачать офлайн-копию
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setAbout(true)}>
            <Info size={18} strokeWidth={1.5} aria-hidden />
            О сервисе
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveSheet
        open={links}
        onOpenChange={setLinks}
        title="Ссылки экипажа"
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
                  <span className="block text-[15px] font-semibold text-ink">{p.name}</span>
                  <span className="block text-[13px] text-muted">{permName(p.perm)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Скопировать ссылку: ${p.name}`}
                  onClick={() => copy(linkFor(p), `Ссылка для ${p.name} скопирована`)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-accent-text hover:bg-zebra"
                >
                  <Copy size={19} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
              <div className="tnum truncate pb-1 text-[12px] text-muted">{linkFor(p)}</div>
            </li>
          ))}
        </ul>
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
        <p className="text-[15px] leading-relaxed text-ink">
          Лист живёт у всех участников сразу: правки сливаются по позициям, а не «кто последний,
          тот и прав». Права даёт личная ссылка. Владелец снимает офлайн-копию одним файлом —
          он открывается без интернета и без сервера.
        </p>
        <p className="mt-3 text-[13px] text-muted">
          Вы сейчас: {perms.mePerson ? perms.mePerson.name : 'без личной ссылки'} ·{' '}
          {permName(perms.perm)}
        </p>
      </ResponsiveSheet>
    </>
  )
}
