import { useState, useEffect, useCallback } from 'react';
import { hrProductivityApi, tokenStorage, dataCache, HRProductivityApiError } from '../api/hrProductivityApi';

/**
 * 人事生産性データを管理するカスタムフック
 * @param {string} searchFrom - 検索開始日 (yyyy-mm-dd)
 * @param {string} searchTo - 検索終了日 (yyyy-mm-dd)
 * @param {string} storeCode - 店舗コード（'all'で全店舗）
 * @param {boolean} autoRefresh - 自動更新を有効にするか
 * @param {number} refreshInterval - 自動更新間隔（ミリ秒）
 * @returns {Object}
 */
export const useHRProductivity = (
  searchFrom,
  searchTo,
  storeCode = 'all',
  autoRefresh = false,
  refreshInterval = 60000
) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  /**
   * トークンを取得または更新
   */
  const ensureToken = useCallback(async () => {
    // 既存のトークンが有効ならそれを使用
    if (tokenStorage.isValid()) {
      const { token: cachedToken } = tokenStorage.get();
      setToken(cachedToken);
      return cachedToken;
    }

    // 新しいトークンを取得
    try {
      const email = import.meta.env.VITE_HR_API_EMAIL;
      const password = import.meta.env.VITE_HR_API_PASSWORD;

      if (!email || !password) {
        throw new Error('API認証情報が設定されていません');
      }

      const result = await hrProductivityApi.login(email, password);
      tokenStorage.save(result.token, result.expires_at);
      setToken(result.token);
      return result.token;
    } catch (err) {
      console.error('Token acquisition error:', err);
      setError(err instanceof HRProductivityApiError ? err.message : 'トークン取得に失敗しました');
      return null;
    }
  }, []);

  /**
   * データを取得
   */
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!searchFrom || !searchTo) {
      return;
    }

    // キャッシュチェック
    if (!forceRefresh) {
      const cacheKey = dataCache.generateKey(searchFrom, searchTo, storeCode);
      const cached = dataCache.get(cacheKey);
      if (cached) {
        setData(cached);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // トークンを確保
      const currentToken = await ensureToken();
      if (!currentToken) {
        throw new Error('認証トークンが取得できませんでした');
      }

      // データ取得
      const result = await hrProductivityApi.getStoreProductivityData(
        currentToken,
        storeCode,
        searchFrom,
        searchTo
      );

      // キャッシュに保存
      const cacheKey = dataCache.generateKey(searchFrom, searchTo, storeCode);
      dataCache.set(cacheKey, result);

      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data fetch error:', err);
      
      if (err instanceof HRProductivityApiError) {
        setError(err.message);
      } else {
        setError('データの取得に失敗しました');
      }
      
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchFrom, searchTo, storeCode, ensureToken]);

  /**
   * 初回データ取得
   */
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 自動更新
   */
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(() => {
      fetchData(true); // 強制リフレッシュ
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  /**
   * 手動更新
   */
  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refetch,
  };
};

/**
 * サマリーデータを計算するヘルパーフック
 * @param {Array} data - 人事生産性データ
 * @returns {Object} サマリー統計
 */
export const useProductivitySummary = (data) => {
  return useState(() => {
    if (!data || data.length === 0) {
      return {
        totalSales: 0,
        totalWorkHours: 0,
        totalWorkers: 0,
        avgProductivity: 0,
        maxProductivity: 0,
        minProductivity: 0,
      };
    }

    const totalSales = data.reduce((sum, item) => {
      const sales = parseFloat(item.kingaku) || 0;
      return sum + sales;
    }, 0);

    const totalWorkHours = data.reduce((sum, item) => {
      const hours = parseFloat(item.wk_tm) || 0;
      return sum + hours;
    }, 0);

    const totalWorkers = data.reduce((sum, item) => {
      return sum + (item.wk_cnt || 0);
    }, 0);

    const avgProductivity = totalWorkHours > 0 ? totalSales / totalWorkHours : 0;

    const productivities = data
      .map(item => parseFloat(item.spd) || 0)
      .filter(p => p > 0);

    const maxProductivity = productivities.length > 0 ? Math.max(...productivities) : 0;
    const minProductivity = productivities.length > 0 ? Math.min(...productivities) : 0;

    return {
      totalSales,
      totalWorkHours,
      totalWorkers,
      avgProductivity,
      maxProductivity,
      minProductivity,
    };
  })[0];
};

/**
 * アラート判定を行うヘルパーフック
 * @param {Array} data - 人事生産性データ
 * @param {number} threshold - アラート閾値（人時生産性）
 * @returns {Array} アラート配列
 */
export const useProductivityAlerts = (data, threshold = 2000) => {
  return useState(() => {
    if (!data || data.length === 0) {
      return [];
    }

    const alerts = [];

    data.forEach(item => {
      const productivity = parseFloat(item.spd) || 0;

      if (productivity < threshold && productivity > 0) {
        alerts.push({
          type: 'warning',
          storeName: item.tenpo_name,
          date: item.wk_date,
          time: item.dayweek,
          productivity,
          message: `人員不足の可能性（人時生産性: ¥${productivity.toLocaleString()}）`,
        });
      }

      // 詳細データからも判定
      if (item.detail && item.detail.length > 0) {
        item.detail.forEach(detail => {
          const detailProductivity = parseFloat(detail.sph) || 0;
          
          if (detailProductivity < threshold && detailProductivity > 0) {
            alerts.push({
              type: 'warning',
              storeName: item.tenpo_name,
              date: item.wk_date,
              time: detail.tm,
              productivity: detailProductivity,
              message: `${detail.tm}: 人員不足の可能性（人時生産性: ¥${detailProductivity.toLocaleString()}）`,
            });
          }
        });
      }
    });

    return alerts;
  })[0];
};
