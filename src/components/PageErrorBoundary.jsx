import React from 'react';

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, hasTriedReload: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[PageError] ${this.props.pageName || 'Unknown'}:`, error, errorInfo);
    
    // Detect dynamic import failure (stale cache after deployment)
    const isDynamicImportError = 
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Loading CSS chunk') ||
      error?.message?.includes('Importing a module script failed');
    
    if (isDynamicImportError && !this.state.hasTriedReload) {
      // Check if we already tried reloading recently (prevent infinite reload loop)
      const lastReload = sessionStorage.getItem('_sw_reload_time');
      const now = Date.now();
      if (!lastReload || (now - parseInt(lastReload, 10)) > 10000) {
        sessionStorage.setItem('_sw_reload_time', now.toString());
        console.log('[PageErrorBoundary] Dynamic import failed, clearing caches and reloading...');
        
        // Unregister service workers and clear caches before reloading
        this.clearCachesAndReload();
        return;
      }
    }
  }

  clearCachesAndReload = async () => {
    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        console.log('[PageErrorBoundary] Service workers unregistered');
      }
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[PageErrorBoundary] Caches cleared');
      }
    } catch (e) {
      console.error('[PageErrorBoundary] Cache cleanup error:', e);
    }
    
    // Force reload from server
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleForceReload = () => {
    this.clearCachesAndReload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const isDynamicImportError = 
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Loading CSS chunk') ||
        this.state.error?.message?.includes('Importing a module script failed');

      const isNetworkError =
        this.state.error?.message?.includes('fetch') ||
        this.state.error?.message?.includes('network') ||
        this.state.error?.message?.includes('Network') ||
        this.state.error?.message?.includes('Failed to fetch') ||
        this.state.error?.message?.includes('Load failed');

      return (
        <div className="min-h-[50vh] flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              {isNetworkError ? 'データの読み込みに失敗しました' : 'ページの読み込みに失敗しました'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {isDynamicImportError 
                ? 'アプリが更新されました。ページを再読み込みしてください。'
                : isNetworkError
                ? '通信状態を確認して、もう一度お試しください。'
                : 'もう一度お試しください。問題が続く場合はホーム画面に戻ってください。'}
            </p>

            <div className="flex flex-col gap-2">
              {isDynamicImportError ? (
                <button
                  onClick={this.handleForceReload}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow"
                >
                  ページを再読み込み
                </button>
              ) : (
                <>
                  <button
                    onClick={this.handleRetry}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow"
                  >
                    再試行
                  </button>
                  <button
                    onClick={this.handleGoHome}
                    className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all"
                  >
                    ホーム画面に戻る
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;
