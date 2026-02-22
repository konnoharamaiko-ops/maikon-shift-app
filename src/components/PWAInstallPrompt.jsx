import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstall(false);
  };

  if (!showInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-white shadow-lg rounded-lg p-4 z-50 border border-gray-200 md:max-w-md md:left-auto md:right-4">
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <img 
          src="/pwa-192x192.png" 
          alt="アプリアイコン" 
          className="w-12 h-12 rounded-lg"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">アプリをインストール</h3>
          <p className="text-xs text-gray-600 mb-3">
            ホーム画面に追加して、アプリのように使えます
          </p>
          <div className="flex gap-2">
            <Button onClick={handleInstall} size="sm">
              インストール
            </Button>
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              後で
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
