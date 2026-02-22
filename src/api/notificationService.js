/**
 * 通知サービス
 * メール送信（Resend API）とLINE通知（LINE Messaging API）を提供
 * 
 * すべての通知はSupabase Edge Function経由で送信
 * APIキーはEdge FunctionのSecretsに安全に保存
 */

const EDGE_FUNCTION_URL = 'https://jafexmvuyevnmigxoenp.supabase.co/functions/v1/dynamic-api';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZmV4bXZ1eWV2bm1pZ3hvZW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MjE3NDgsImV4cCI6MjA4NjA5Nzc0OH0.UNoVVwUKaYd1_Q44Izvxd8jhKm9gkAYcMJicPDi9amE';

/**
 * Edge Functionを呼び出すヘルパー
 */
async function callEdgeFunction(payload) {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('[NotificationService] Edge Function エラー:', result);
      return { success: false, error: result.error || 'Unknown error' };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('[NotificationService] Edge Function 呼び出し失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 設定キャッシュをクリア（互換性のため残す）
 */
export function clearApiKeyCache() {
  // Edge Function方式ではキャッシュ不要
}

/**
 * Resend APIでメールを送信（Edge Function経由）
 * @param {Object} params - メール送信パラメータ
 * @param {string} params.to - 送信先メールアドレス
 * @param {string} params.subject - 件名
 * @param {string} params.body - 本文（プレーンテキスト）
 * @param {string} [params.html] - HTML本文（オプション）
 * @returns {Promise<boolean>} 送信成功かどうか
 */
export async function sendEmail({ to, subject, body, html = null }) {
  if (!to) {
    console.log('[NotificationService] メール送信スキップ: 送信先未指定');
    return false;
  }

  const payload = {
    action: 'send-email',
    to,
    subject,
    text: body || '',
  };

  if (html) {
    payload.html = html;
  }

  const result = await callEdgeFunction(payload);
  
  if (result.success) {
    console.log('[NotificationService] メール送信成功:', result.data?.data?.id);
    return true;
  } else {
    console.error('[NotificationService] メール送信失敗:', result.error);
    return false;
  }
}

/**
 * LINE Messaging APIで通知を送信（Edge Function経由）
 * @param {Object} params - LINE通知パラメータ
 * @param {string} params.userId - LINEユーザーID
 * @param {string} params.message - メッセージ本文
 * @returns {Promise<boolean>} 送信成功かどうか
 */
export async function sendLineMessage({ userId, message }) {
  if (!userId) {
    console.log('[NotificationService] LINE通知スキップ: ユーザーID未指定');
    return false;
  }

  const result = await callEdgeFunction({
    action: 'send-line-push',
    userId,
    message,
  });

  if (result.success) {
    console.log('[NotificationService] LINE通知送信成功');
    return true;
  } else {
    console.error('[NotificationService] LINE通知送信失敗:', result.error);
    return false;
  }
}

/**
 * LINE Messaging APIで複数ユーザーに通知を送信（Edge Function経由）
 * @param {Object} params - LINE通知パラメータ
 * @param {string[]} params.userIds - LINEユーザーIDの配列
 * @param {string} params.message - メッセージ本文
 * @returns {Promise<boolean>} 送信成功かどうか
 */
export async function sendLineMulticast({ userIds, message }) {
  if (!userIds || userIds.length === 0) {
    console.log('[NotificationService] LINE一斉通知スキップ: ユーザーID未指定');
    return false;
  }

  const result = await callEdgeFunction({
    action: 'send-line-push',
    userIds,
    message,
  });

  if (result.success) {
    console.log('[NotificationService] LINE一斉通知送信成功');
    return true;
  } else {
    console.error('[NotificationService] LINE一斉通知送信失敗:', result.error);
    return false;
  }
}

/**
 * LINE Broadcast通知を送信（全友だちに送信、Edge Function経由）
 * @param {Object} params - LINE Broadcast通知パラメータ
 * @param {string} params.message - メッセージ本文
 * @returns {Promise<boolean>} 送信成功かどうか
 */
export async function sendLineBroadcast({ message }) {
  const result = await callEdgeFunction({
    action: 'send-line-broadcast',
    message,
  });

  if (result.success) {
    console.log('[NotificationService] LINE Broadcast送信成功');
    return true;
  } else {
    console.error('[NotificationService] LINE Broadcast送信失敗:', result.error);
    return false;
  }
}

/**
 * メールとLINE両方に通知を送信
 * @param {Object} params
 * @param {string} params.userEmail - メールアドレス
 * @param {string} [params.lineUserId] - LINEユーザーID
 * @param {string} params.subject - メール件名
 * @param {string} params.message - メッセージ本文
 * @param {string} [params.html] - HTML本文
 * @returns {Promise<{email: boolean, line: boolean}>}
 */
export async function sendNotification({ userEmail, lineUserId, subject, message, html = null }) {
  const results = { email: false, line: false };

  // メール送信（Edge Function経由）
  if (userEmail) {
    results.email = await sendEmail({
      to: userEmail,
      subject,
      body: message,
      html,
    });
  }

  // LINE通知（Edge Function経由）
  if (lineUserId) {
    results.line = await sendLineMessage({
      userId: lineUserId,
      message: `${subject}\n\n${message}`,
    });
  }

  return results;
}
