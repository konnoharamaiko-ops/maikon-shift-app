/**
 * Supabase Helper Functions
 * 
 * Base44のAPIをSupabaseに置き換えるためのヘルパー関数群。
 * Supabaseのクエリは { data, error } を返すため、
 * 統一的にデータを取り出すラッパーを提供する。
 */
import { supabase } from './supabaseClient';

/**
 * ユニークIDを生成する（Base44互換の24文字hex文字列）
 */
function generateId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return timestamp + random;
}

/**
 * レコードにIDが無い場合に自動生成して付与する
 */
function ensureId(record) {
  if (!record.id) {
    return { ...record, id: generateId() };
  }
  return record;
}

/**
 * テーブルから全レコードを取得する
 */
export async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

/**
 * テーブルからフィルタ付きでレコードを取得する
 */
export async function fetchFiltered(table, filters = {}, orderBy = null) {
  let query = supabase.from(table).select('*');
  
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      query = query.eq(key, value);
    }
  }
  
  if (orderBy) {
    const desc = orderBy.startsWith('-');
    const column = desc ? orderBy.slice(1) : orderBy;
    query = query.order(column, { ascending: !desc });
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * テーブルにレコードを挿入する
 */
export async function insertRecord(table, record) {
  const recordWithId = ensureId(record);
  const { data, error } = await supabase.from(table).insert(recordWithId).select();
  if (error) throw error;
  return data?.[0] || null;
}

/**
 * テーブルに複数レコードを一括挿入する
 */
export async function insertRecords(table, records) {
  const recordsWithIds = records.map(r => ensureId(r));
  const { data, error } = await supabase.from(table).insert(recordsWithIds).select();
  if (error) throw error;
  return data || [];
}

/**
 * テーブルのレコードを更新する
 */
export async function updateRecord(table, id, updates) {
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] || null;
}

/**
 * テーブルのレコードを削除する
 */
export async function deleteRecord(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

/**
 * テーブルの単一レコードを取得する
 */
export async function fetchSingle(table, column, value) {
  const { data, error } = await supabase.from(table).select('*').eq(column, value).single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
  return data || null;
}

/**
 * Supabase Realtimeでテーブルの変更を監視する
 */
export function subscribeToTable(table, callback) {
  const channel = supabase
    .channel(`${table}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      callback({
        type: payload.eventType === 'INSERT' ? 'create' : 
              payload.eventType === 'UPDATE' ? 'update' : 'delete',
        data: payload.new || payload.old
      });
    })
    .subscribe();
  
  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * 通知を作成する（Base44のNotification.createの代替）
 */
export async function createNotificationRecord(notificationData) {
  return insertRecord('Notification', {
    ...notificationData,
    created_date: new Date().toISOString()
  });
}

/**
 * Supabase Edge Function URL
 */
const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dynamic-api`;

/**
 * メール送信（Supabase Edge Function経由 → Resend API）
 * APIキーはEdge FunctionのSecretsに安全に保存されています
 */
export async function sendEmailNotification({ to, subject, body, html = null, attachments = null }) {
  try {
    if (!to) {
      console.log('[Email] 送信先未指定のためスキップ');
      return false;
    }

    const payload = {
      action: 'send-email',
      to,
      subject,
      text: body || '',
    };
    if (html) payload.html = html;
    // PDF添付ファイル対応（base64エンコードされたデータ）
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      payload.attachments = attachments;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Email] Edge Function送信エラー:', errorData);
      return false;
    }

    const result = await response.json();
    console.log('[Email] 送信成功:', result?.data?.id);
    return true;
  } catch (error) {
    console.error('[Email] 送信失敗:', error);
    return false;
  }
}

/**
 * LINE通知送信（Supabase Edge Function経由 → LINE Messaging API Push/Multicast）
 * APIキーはEdge FunctionのSecretsに安全に保存されています
 * userIds: LINE User IDの配列（複数ユーザーに送信可能）
 * userId: 単一のLINE User ID（後方互換性のため残す）
 */
export async function sendLineNotification({ userId, userIds, message }) {
  try {
    // userIds配列を構築
    let targetIds = [];
    if (userIds && Array.isArray(userIds)) {
      targetIds = userIds.filter(id => id); // null/undefinedを除外
    } else if (userId) {
      targetIds = [userId];
    }

    if (targetIds.length === 0) {
      console.log('[LINE] 送信先のLINE User IDがないためスキップ');
      return false;
    }

    const payload = {
      action: 'send-line-push',
      message,
    };

    // 単一ユーザーの場合はuserIdを使用、複数の場合はuserIdsを使用
    if (targetIds.length === 1) {
      payload.userId = targetIds[0];
    } else {
      payload.userIds = targetIds;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[LINE] Messaging API送信エラー:', errorData);
      return false;
    }

    console.log(`[LINE] Messaging API送信成功 (${targetIds.length}人)`);
    return true;
  } catch (error) {
    console.error('[LINE] 送信失敗:', error);
    return false;
  }
}

/**
 * LINE ブロードキャスト送信（全フォロワーに送信）
 * APIキーはEdge FunctionのSecretsに安全に保存されています
 */
export async function sendLineBroadcast({ message }) {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'send-line-broadcast',
        message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[LINE] ブロードキャスト送信エラー:', errorData);
      return false;
    }

    console.log('[LINE] ブロードキャスト送信成功');
    return true;
  } catch (error) {
    console.error('[LINE] ブロードキャスト送信失敗:', error);
    return false;
  }
}
