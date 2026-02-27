/**
 * 人事生産性管理API
 * 顧客管理DB APIとの通信を担当
 */

// 新しいProductivity APIを使用（Vercel Serverless Functions）
const API_BASE_URL = '/api/productivity';

/**
 * APIエラークラス
 */
export class HRProductivityApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'HRProductivityApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * 人事生産性管理API
 */
export const hrProductivityApi = {
  /**
   * API認証トークンを取得
   * @param {string} email - メールアドレス
   * @param {string} password - パスワード
   * @returns {Promise<{token: string, expires_at: string}>}
   */
  // 新しいAPIではログイン不要（環境変数で認証）
  async login(email, password) {
    // ダミー実装：常に成功を返す
    return {
      token: 'dummy-token',
      expires_at: new Date(Date.now() + 86400000).toISOString(), // 24時間後
    };
  },

  /**
   * 人事生産性データを取得
   * @param {string} token - Bearer Token
   * @param {string} searchFrom - 検索開始日 (yyyy-mm-dd)
   * @param {string} searchTo - 検索終了日 (yyyy-mm-dd)
   * @param {number} page - ページ番号
   * @returns {Promise<{data: Array}>}
   */
  async getProductivityData(token, searchFrom, searchTo, page = 1) {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date_from: searchFrom,
          date_to: searchTo,
        }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new HRProductivityApiError(
            'パラメータエラー: 日付範囲を確認してください（最大62日）',
            400,
            await response.json().catch(() => null)
          );
        }
        throw new HRProductivityApiError(
          'データ取得に失敗しました',
          response.status,
          await response.json().catch(() => null)
        );
      }

      const result = await response.json();
      return result;
    } catch (error) {
      if (error instanceof HRProductivityApiError) {
        throw error;
      }
      throw new HRProductivityApiError(
        `データ取得エラー: ${error.message}`,
        0,
        null
      );
    }
  },

  /**
   * 店舗別データを取得
   * @param {string} token - Bearer Token
   * @param {string} storeCode - 店舗コード
   * @param {string} searchFrom - 検索開始日
   * @param {string} searchTo - 検索終了日
   * @returns {Promise<Array>}
   */
  async getStoreProductivityData(token, storeCode, searchFrom, searchTo) {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date_from: searchFrom,
          date_to: searchTo,
          store_code: storeCode,
        }),
      });

      if (!response.ok) {
        throw new HRProductivityApiError(
          'データ取得に失敗しました',
          response.status,
          await response.json().catch(() => null)
        );
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      if (error instanceof HRProductivityApiError) {
        throw error;
      }
      throw new HRProductivityApiError(
        `データ取得エラー: ${error.message}`,
        0,
        null
      );
    }
  },

  /**
   * 日付別データを取得
   * @param {string} token - Bearer Token
   * @param {string} date - 日付 (yyyy-mm-dd)
   * @returns {Promise<Array>}
   */
  async getDateProductivityData(token, date) {
    return this.getProductivityData(token, date, date);
  },
};

/**
 * トークンストレージ
 */
export const tokenStorage = {
  /**
   * トークンを保存
   * @param {string} token - Bearer Token
   * @param {string} expiresAt - 有効期限
   */
  save(token, expiresAt) {
    localStorage.setItem('hr_api_token', token);
    localStorage.setItem('hr_api_token_expires_at', expiresAt);
  },

  /**
   * トークンを取得
   * @returns {{token: string|null, expiresAt: string|null}}
   */
  get() {
    return {
      token: localStorage.getItem('hr_api_token'),
      expiresAt: localStorage.getItem('hr_api_token_expires_at'),
    };
  },

  /**
   * トークンをクリア
   */
  clear() {
    localStorage.removeItem('hr_api_token');
    localStorage.removeItem('hr_api_token_expires_at');
  },

  /**
   * トークンが有効かチェック
   * @returns {boolean}
   */
  isValid() {
    const { token, expiresAt } = this.get();
    
    if (!token || !expiresAt) {
      return false;
    }

    const now = new Date();
    const expires = new Date(expiresAt);
    
    return now < expires;
  },
};

/**
 * データキャッシュ
 */
export const dataCache = {
  cache: new Map(),
  cacheDuration: 60000, // 1分

  /**
   * キャッシュキーを生成
   */
  generateKey(searchFrom, searchTo, storeCode = 'all') {
    return `${searchFrom}_${searchTo}_${storeCode}`;
  },

  /**
   * データを保存
   */
  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  },

  /**
   * データを取得
   */
  get(key) {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.cacheDuration) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  },

  /**
   * キャッシュをクリア
   */
  clear() {
    this.cache.clear();
  },
};
