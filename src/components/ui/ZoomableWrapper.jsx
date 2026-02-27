import React, { useRef, useCallback, useEffect, useState } from 'react';

/**
 * ZoomableWrapper - 画面幅に自動フィットするラッパー（ズーム操作なし）
 * 
 * コンテンツの自然幅が画面幅を超える場合、transform:scale() で自動縮小する。
 * ユーザーによるピンチズームや＋/−ボタンは提供しない。
 * 縮小時は sticky を一括 relative に上書きする。
 * 
 * 縦スクロールはページ全体に任せ、横スクロールのみコンテナ内で処理する。
 * これにより sticky 要素がナビバーと重なる問題を防ぐ。
 */

let wrapperIdCounter = 0;

export default function ZoomableWrapper({
  children,
  className = '',
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const scrollRef = useRef(null);
  const [scale, setScale] = useState(1);
  const measuringRef = useRef(false);
  const measureTimersRef = useRef([]);
  const [wrapperId] = useState(() => `zw-${++wrapperIdCounter}`);

  // コンテンツの自然幅を計測してautoScaleを算出
  const measure = useCallback(() => {
    if (measuringRef.current) return;
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    measuringRef.current = true;

    const availableWidth = container.clientWidth;
    if (availableWidth <= 0) {
      measuringRef.current = false;
      return;
    }

    // 一時的にtransformを解除し、幅制約を外して自然幅を正確に計測
    const savedTransform = content.style.transform;
    const savedWidth = content.style.width;
    const savedMinWidth = content.style.minWidth;
    const savedOverflow = content.style.overflow;

    content.style.transform = 'none';
    content.style.width = 'max-content';
    content.style.minWidth = 'max-content';
    content.style.overflow = 'visible';

    // テーブル要素のmin-widthも一時的に解除して自然幅を取得
    const tables = content.querySelectorAll('table');
    const savedTableStyles = [];
    tables.forEach(t => {
      savedTableStyles.push({
        width: t.style.width,
        minWidth: t.style.minWidth,
        tableLayout: t.style.tableLayout,
        maxWidth: t.style.maxWidth,
      });
      t.style.width = 'max-content';
      t.style.minWidth = 'max-content';
      t.style.tableLayout = 'auto';
      t.style.maxWidth = 'none';
    });

    // リフロー強制
    void content.offsetWidth;

    // 自然幅を取得
    let naturalWidth = Math.max(content.scrollWidth, content.offsetWidth);

    // テーブルの自然幅も個別に確認
    tables.forEach(t => {
      void t.offsetWidth;
      const tw = Math.max(t.scrollWidth, t.offsetWidth);
      if (tw > naturalWidth) naturalWidth = tw;
    });

    // テーブルスタイルを元に戻す
    tables.forEach((t, i) => {
      const s = savedTableStyles[i];
      t.style.width = s.width;
      t.style.minWidth = s.minWidth;
      t.style.tableLayout = s.tableLayout;
      t.style.maxWidth = s.maxWidth;
    });

    // コンテンツスタイルを元に戻す
    content.style.transform = savedTransform;
    content.style.width = savedWidth;
    content.style.minWidth = savedMinWidth;
    content.style.overflow = savedOverflow;

    // autoScaleを計算（自然幅が画面幅を超える場合のみ縮小）
    let newScale = 1;
    if (naturalWidth > availableWidth + 2) {
      newScale = Math.max(0.1, Math.floor((availableWidth / naturalWidth) * 1000) / 1000);
    }

    setScale(newScale);
    measuringRef.current = false;
  }, []);

  // マウント時・リサイズ時に計測
  useEffect(() => {
    measureTimersRef.current.forEach(clearTimeout);
    measureTimersRef.current = [50, 200, 500, 1000].map(ms =>
      setTimeout(measure, ms)
    );

    let ro;
    if (containerRef.current) {
      ro = new ResizeObserver(() => {
        if (!measuringRef.current) {
          const t = setTimeout(measure, 50);
          measureTimersRef.current.push(t);
        }
      });
      ro.observe(containerRef.current);
    }

    let mo;
    if (contentRef.current) {
      mo = new MutationObserver(() => {
        if (!measuringRef.current) {
          const t = setTimeout(measure, 150);
          measureTimersRef.current.push(t);
        }
      });
      mo.observe(contentRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      measureTimersRef.current.forEach(clearTimeout);
      measureTimersRef.current = [];
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [measure]);

  // children変更時に再計測 + スクロール位置リセット
  useEffect(() => {
    measureTimersRef.current.forEach(clearTimeout);
    measureTimersRef.current = [80, 300, 700].map(ms =>
      setTimeout(measure, ms)
    );

    // スクロール位置をリセット
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    }

    return () => {
      measureTimersRef.current.forEach(clearTimeout);
      measureTimersRef.current = [];
    };
  }, [children, measure]);

  const isScaledDown = scale < 0.999;

  // 縮小時のコンテナ高さ計算
  const contentHeight = contentRef.current ? contentRef.current.scrollHeight : 0;
  const displayHeight = isScaledDown ? contentHeight * scale : undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ overflow: 'hidden' }}>
      {/* 縮小モード時: sticky要素を一括 relative に上書き */}
      <style>{isScaledDown ? `
        #${wrapperId} [class*="sticky"] {
          position: relative !important;
          top: auto !important;
          bottom: auto !important;
          left: auto !important;
          right: auto !important;
        }
      ` : ''}</style>

      <div
        ref={scrollRef}
        style={{
          overflowX: isScaledDown ? 'hidden' : 'auto',
          overflowY: 'visible',
          WebkitOverflowScrolling: 'touch',
          height: isScaledDown && displayHeight > 0 ? `${displayHeight}px` : 'auto',
        }}
      >
        <div
          id={wrapperId}
          ref={contentRef}
          style={isScaledDown ? {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${100 / scale}%`,
          } : {
            transform: 'none',
            width: '100%',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
