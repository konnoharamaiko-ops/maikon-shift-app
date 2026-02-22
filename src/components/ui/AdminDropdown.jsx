import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Shield, ChevronDown, Check } from 'lucide-react';

/**
 * AdminDropdown - 管理者ユーザーの個別表示切り替えドロップダウン
 * createPortalを使ってbody直下にレンダリングし、親要素のoverflowやz-indexの影響を受けない
 */
export default function AdminDropdown({
  adminUsers,
  visibleAdminIds,
  toggleAdminUser,
  setVisibleAdminIds,
  adminDropdownOpen,
  setAdminDropdownOpen,
  title = '管理者を表示',
}) {
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const [isPositioned, setIsPositioned] = useState(false);

  // ボタンの位置を基準にドロップダウンの位置を計算
  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 240;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > viewportWidth - 8) left = viewportWidth - dropdownWidth - 8;

    const estimatedHeight = Math.min(adminUsers.length * 48 + 60, 320);
    let top = rect.bottom + 4;
    if (top + estimatedHeight > viewportHeight - 8) {
      top = rect.top - estimatedHeight - 4;
      if (top < 8) top = 8;
    }

    return { top, left };
  }, [adminUsers.length]);

  // 開いた瞬間に位置を計算（useLayoutEffectで描画前に実行）
  useLayoutEffect(() => {
    if (adminDropdownOpen) {
      const pos = calcPosition();
      setDropdownPos(pos);
      // 次のフレームで表示（位置が確定してから）
      requestAnimationFrame(() => {
        setIsPositioned(true);
      });
    } else {
      setIsPositioned(false);
      setDropdownPos(null);
    }
  }, [adminDropdownOpen, calcPosition]);

  // スクロール・リサイズ時の位置更新
  useEffect(() => {
    if (!adminDropdownOpen) return;
    const handleUpdate = () => {
      const pos = calcPosition();
      if (pos) setDropdownPos(pos);
    };
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [adminDropdownOpen, calcPosition]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!adminDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setAdminDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [adminDropdownOpen, setAdminDropdownOpen]);

  return (
    <>
      <Button
        ref={buttonRef}
        variant={visibleAdminIds.length > 0 ? "default" : "outline"}
        size="sm"
        onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
        className={visibleAdminIds.length > 0 ? "bg-violet-600 hover:bg-violet-700 text-white" : ""}
        title="管理者・マネージャーをシフト表に表示/非表示"
      >
        <Shield className="w-4 h-4 mr-1" />
        管理者{visibleAdminIds.length > 0 ? `(${visibleAdminIds.length})` : ''}
        <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${adminDropdownOpen ? 'rotate-180' : ''}`} />
      </Button>

      {adminDropdownOpen && dropdownPos && createPortal(
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setAdminDropdownOpen(false)}
          />
          {/* ドロップダウン本体 */}
          <div
            ref={dropdownRef}
            className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 py-1"
            style={{
              zIndex: 9999,
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              width: '240px',
              maxHeight: '320px',
              overflowY: 'auto',
              opacity: isPositioned ? 1 : 0,
              transform: isPositioned ? 'scale(1)' : 'scale(0.95)',
              transition: 'opacity 120ms ease-out, transform 120ms ease-out',
            }}
          >
            <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              {title}
            </div>
            {adminUsers.map(au => {
              const isVisible = visibleAdminIds.includes(au.id);
              const roleName = (au.user_role || au.role) === 'admin' ? '管理者' : 'マネージャー';
              return (
                <button
                  key={au.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAdminUser(au.id);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-violet-50 transition-colors text-left"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isVisible ? 'bg-violet-600 border-violet-600' : 'border-slate-300 bg-white'
                  }`}>
                    {isVisible && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {au.metadata?.display_name || au.full_name || au.email?.split('@')[0]}
                    </div>
                    <div className="text-[10px] text-slate-400">{roleName}</div>
                  </div>
                </button>
              );
            })}
            {visibleAdminIds.length > 0 && (
              <div className="border-t border-slate-100 px-3 py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setVisibleAdminIds([]);
                    setAdminDropdownOpen(false);
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  すべて非表示にする
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
