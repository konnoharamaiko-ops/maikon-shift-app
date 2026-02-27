import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageErrorBoundary from '@/components/PageErrorBoundary';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => null;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// ページ読み込み中のスケルトン表示
const PageLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
      <p className="text-xs text-slate-400">読み込み中...</p>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <PageErrorBoundary pageName={mainPageKey}>
              <Suspense fallback={<PageLoadingFallback />}>
                <MainPage />
              </Suspense>
            </PageErrorBoundary>
          </LayoutWrapper>
        } />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <PageErrorBoundary pageName={path}>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <Page />
                  </Suspense>
                </PageErrorBoundary>
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  const isOnline = useOnlineStatus();

  return (
    <ErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          {!isOnline && (
            <div className="fixed top-0 left-0 right-0 bg-yellow-100 text-yellow-800 px-4 py-2 text-center text-sm z-50">
              オフラインモードで動作中
            </div>
          )}
          <AuthenticatedApp />
          <PWAInstallPrompt />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
