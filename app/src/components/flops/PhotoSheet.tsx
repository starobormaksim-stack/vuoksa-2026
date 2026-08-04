import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Btn } from './Btn'
import { ResponsiveSheet } from './ResponsiveSheet'

/**
 * Фотографии: выбор файла и кадрирование.
 *
 * Механика перенесена из первой версии (src/app.template.html, cropImage/cropPhoto/cropHero),
 * а не выдумана заново. Главное правило то же: **что видно в рамке — то и сохраняется**.
 * Снимок обрезается ровно так, как его подвинули, и дальше нигде не переобрезается —
 * поэтому одна и та же фотография одинаково выглядит и в карточке, и в списке, и в разборе.
 *
 * Результат — `data:image/jpeg;base64`. Сторона ограничена (по умолчанию 800 px)
 * и качество 0,82: документ целиком лежит в localStorage и целиком уходит в Supabase,
 * поэтому исходный снимок с телефона в него класть нельзя.
 *
 * Перетаскивание идёт мимо React: позиция пишется прямо в стиль картинки. Через состояние
 * это давало бы перерисовку на каждое движение пальца, и картинка отставала бы от руки.
 */

/** Ограничение стороны и качество по умолчанию — под фотографию участника. */
const OUT = 800
const QUALITY = 0.82

/* ─────────── выбор файла ─────────── */

/**
 * Скрытое поле выбора файла. Возвращает готовую разметку и функцию «открыть выбор».
 *
 *   const { pick, input } = usePhotoPick(setSrc)
 *   ...
 *   <button onClick={pick}>Поменять фотографию</button>
 *   {input}
 */
export function usePhotoPick(onPicked: (dataUrl: string) => void): {
  pick: () => void
  input: React.ReactElement
} {
  const ref = useRef<HTMLInputElement | null>(null)
  const cb = useRef(onPicked)
  cb.current = onPicked

  const pick = useCallback(() => ref.current?.click(), [])

  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0]
        /* поле обнуляем сразу: иначе повторный выбор того же файла не сработает */
        e.target.value = ''
        if (!f) return
        const fr = new FileReader()
        fr.onload = () => cb.current(String(fr.result))
        fr.onerror = () => toast('Снимок не прочитался. Попробуйте другой')
        fr.readAsDataURL(f)
      }}
    />
  )

  return { pick, input }
}

/* ─────────── кадрирование ─────────── */

interface Props {
  /** исходный снимок (data:URL из usePhotoPick) */
  src: string
  /**
   * Ширина к высоте: 1 — квадрат, больше единицы — лежачий кадр (обложка поездки).
   * Портрет участника с 04.08.2026 квадратный: заказчик просил квадрат, прежние 0,75
   * давали 3 : 4. Кадрируется ровно то, что видно в рамке, — поэтому пропорция рамки
   * и пропорция того места, где снимок потом показывают, обязаны совпадать.
   */
  ratio?: number
  /** длинная сторона результата, px */
  out?: number
  quality?: number
  title: string
  subtitle?: string
  /** подпись под рамкой: что именно увидят остальные */
  frameHint?: string
  okLabel?: string
  onDone: (dataUrl: string) => void
  onClose: () => void
}

export function PhotoCropSheet({
  src,
  ratio = 1,
  out = OUT,
  quality = QUALITY,
  title,
  subtitle,
  frameHint = 'В рамке — то, что увидят остальные.',
  okLabel = 'Поставить',
  onDone,
  onClose,
}: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const img = useRef<HTMLImageElement | null>(null)
  /** размеры исходника; 0 — снимок ещё не загрузился */
  const nat = useRef({ w: 0, h: 0 })
  /** смещение кадра и масштаб — вне React, чтобы не перерисовывать на каждое движение */
  const view = useRef({ ox: 0, oy: 0, zoom: 1 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(1)

  /** Пересчитать положение картинки внутри рамки. */
  const draw = useCallback(() => {
    const b = box.current
    const im = img.current
    if (!b || !im || !nat.current.w) return
    const BW = b.clientWidth
    const BH = b.clientHeight
    if (!BW || !BH) return
    const base = Math.max(BW / nat.current.w, BH / nat.current.h)
    const dw = nat.current.w * base * view.current.zoom
    const dh = nat.current.h * base * view.current.zoom
    const maxX = Math.max(0, (dw - BW) / 2)
    const maxY = Math.max(0, (dh - BH) / 2)
    view.current.ox = Math.max(-maxX, Math.min(maxX, view.current.ox))
    view.current.oy = Math.max(-maxY, Math.min(maxY, view.current.oy))
    im.style.width = dw + 'px'
    im.style.height = dh + 'px'
    im.style.left = BW / 2 - dw / 2 + view.current.ox + 'px'
    im.style.top = BH / 2 - dh / 2 + view.current.oy + 'px'
  }, [])

  /* Рамка меняет ширину вместе со шторкой (поворот телефона, десктоп) — пересчитываем. */
  useEffect(() => {
    const b = box.current
    if (!b) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(b)
    return () => ro.disconnect()
  }, [draw, ready])

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    view.current.ox = d.ox + (e.clientX - d.x)
    view.current.oy = d.oy + (e.clientY - d.y)
    draw()
  }
  const onUp = () => {
    drag.current = null
  }

  /** Собрать результат: рисуем видимую часть в холст нужного размера. */
  const done = () => {
    const b = box.current
    const im = img.current
    if (!b || !im || !nat.current.w) return
    const BW = b.clientWidth
    const BH = b.clientHeight
    const OW = out
    const OH = Math.round(out / ratio)
    const k = OW / BW
    const cv = document.createElement('canvas')
    cv.width = OW
    cv.height = OH
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const base = Math.max(BW / nat.current.w, BH / nat.current.h)
    const dw = nat.current.w * base * view.current.zoom
    const dh = nat.current.h * base * view.current.zoom
    ctx.drawImage(
      im,
      (BW / 2 - dw / 2 + view.current.ox) * k,
      (BH / 2 - dh / 2 + view.current.oy) * k,
      dw * k,
      dh * k,
    )
    onDone(cv.toDataURL('image/jpeg', quality))
    onClose()
  }

  return (
    <ResponsiveSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex gap-2">
          <Btn tone="secondary" scale="lg" className="flex-1" onClick={onClose}>
            Отмена
          </Btn>
          <Btn scale="lg" className="flex-1" disabled={!ready} onClick={done}>
            {okLabel}
          </Btn>
        </div>
      }
    >
      <p className="text-[15px] leading-snug text-muted">
        Подвиньте снимок пальцем или мышью, ползунок — масштаб.
      </p>

      <div
        ref={box}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mx-auto mt-3 w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-2xl border border-line bg-zebra select-none active:cursor-grabbing"
        style={{ aspectRatio: String(ratio) }}
      >
        {/* Картинка позиционируется абсолютно: её левый верхний угол считает draw(). */}
        <img
          ref={img}
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute max-w-none"
          onLoad={(e) => {
            const t = e.currentTarget
            nat.current = { w: t.naturalWidth, h: t.naturalHeight }
            view.current = { ox: 0, oy: 0, zoom: 1 }
            setZoom(1)
            setReady(true)
            draw()
          }}
          onError={() => toast('Это не похоже на картинку')}
        />
      </div>

      <label className="mt-3 flex min-h-11 items-center gap-3">
        <span className="shrink-0 text-[13px] font-semibold text-muted">Масштаб</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => {
            const v = Number(e.target.value) || 1
            view.current.zoom = v
            setZoom(v)
            draw()
          }}
          className="h-2 min-w-0 flex-1 accent-[var(--accent-fill)]"
        />
      </label>

      <p className="mt-2 text-[13px] leading-snug text-muted">{frameHint}</p>
    </ResponsiveSheet>
  )
}
