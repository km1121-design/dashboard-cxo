/**
 * 描画領域の実寸を測る。
 *
 * SVG を viewBox の拡大縮小に任せると文字まで一緒に伸縮して読めなくなるため、
 * 実際の幅を測って等倍で描く。ResizeObserver が無い環境では初期値のまま描く。
 */
import { useEffect, useRef, useState } from 'react';

export function useChartWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    apply();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
