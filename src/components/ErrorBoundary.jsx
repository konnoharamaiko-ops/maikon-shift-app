import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error for debugging
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    // Navigate to home without full reload to preserve auth state
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    try {
      // Clear caches that might cause issues
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(reg => reg.unregister());
        });
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('Clear failed:', e);
    }
    setTimeout(() => {
      window.location.href = '/?v=' + Date.now();
    }, 500);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              エラーが発生しました
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              申し訳ありません。予期しないエラーが発生しました。
              以下のボタンから復帰をお試しください。
            </p>
            
            <div className="space-y-3">
              <button
                onClick={this.handleGoHome}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
              >
                ホーム画面に戻る
              </button>
              <button
                onClick={this.handleReset}
                className="w-full px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all"
              >
                このページを復帰する
              </button>
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-all text-sm"
              >
                ページを再読み込み
              </button>
              <button
                onClick={this.handleClearAndReload}
                className="w-full px-4 py-2.5 text-slate-400 text-xs hover:text-slate-600 transition-all"
              >
                キャッシュをクリアして再読み込み
              </button>
            </div>

            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                  エラー詳細（技術情報）
                </summary>
                <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack?.slice(0, 500)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
