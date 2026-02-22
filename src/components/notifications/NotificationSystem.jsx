import { supabase } from '@/api/supabaseClient';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { insertRecord, fetchFiltered, fetchAll, sendEmailNotification, sendLineNotification, sendLineBroadcast } from '@/api/supabaseHelpers';

// ユーザーメールからユーザーIDを取得するヘルパー
async function getUserIdByEmail(email) {
  try {
    const users = await fetchFiltered('User', { email });
    return users?.[0]?.id || null;
  } catch (error) {
    console.error('ユーザーID取得エラー:', error);
    return null;
  }
}

// 通知設定をAppSettingsから取得するヘルパー
let cachedSettings = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1分キャッシュ

async function getNotificationSettings() {
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSettings;
  }
  try {
    const settings = await fetchAll('AppSettings');
    const result = {
      enableNotifications: true,
      notifShiftConfirm: true,
      notifDeadlineReminder: true,
      notifShiftChange: false,
      notifPaidLeave: true,
      notifStaffShortage: true,
      notifInApp: true,
      notifEmail: true,
      notifLine: true,
    };
    settings.forEach(s => {
      switch (s.setting_key) {
        case 'enable_notifications':
          result.enableNotifications = s.setting_value === 'true';
          break;
        case 'notif_shift_confirm':
          result.notifShiftConfirm = s.setting_value === 'true';
          break;
        case 'notif_deadline_reminder':
          result.notifDeadlineReminder = s.setting_value === 'true';
          break;
        case 'notif_shift_change':
          result.notifShiftChange = s.setting_value === 'true';
          break;
        case 'notif_paid_leave':
          result.notifPaidLeave = s.setting_value === 'true';
          break;
        case 'notif_staff_shortage':
          result.notifStaffShortage = s.setting_value === 'true';
          break;
        case 'notif_in_app':
          result.notifInApp = s.setting_value === 'true';
          break;
        case 'notif_email':
          result.notifEmail = s.setting_value === 'true';
          break;
        case 'notif_line':
          result.notifLine = s.setting_value === 'true';
          break;
      }
    });
    cachedSettings = result;
    cacheTimestamp = now;
    return result;
  } catch (error) {
    console.error('通知設定取得エラー:', error);
    return {
      enableNotifications: true,
      notifShiftConfirm: true,
      notifDeadlineReminder: true,
      notifShiftChange: false,
      notifPaidLeave: true,
      notifStaffShortage: true,
      notifInApp: true,
      notifEmail: true,
      notifLine: true,
    };
  }
}

// 通知設定キャッシュをクリア（設定変更時に呼ぶ）
export function clearNotificationSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}

// 通知を作成し、メール送信も行う
export async function createNotification({ 
  userEmail,
  userId,
  title, 
  message, 
  type, 
  relatedId = null, 
  actionUrl = null,
  sendEmail = true,
  sendLine = true,
  notificationType = null,
  pdfAttachment = null
}) {
  try {
    const settings = await getNotificationSettings();

    // システム全体の通知が無効なら何もしない
    if (!settings.enableNotifications) {
      console.log('[Notification] システム全体の通知が無効です');
      return;
    }

    // 通知種別に応じたチェック
    if (notificationType) {
      switch (notificationType) {
        case 'shift_confirm':
          if (!settings.notifShiftConfirm) {
            console.log('[Notification] シフト確定通知が無効です');
            return;
          }
          break;
        case 'deadline_reminder':
          if (!settings.notifDeadlineReminder) {
            console.log('[Notification] 期限リマインダーが無効です');
            return;
          }
          break;
        case 'shift_change':
          if (!settings.notifShiftChange) {
            console.log('[Notification] シフト変更通知が無効です');
            return;
          }
          break;
        case 'paid_leave':
          if (!settings.notifPaidLeave) {
            console.log('[Notification] 有給申請通知が無効です');
            return;
          }
          break;
        case 'staff_shortage':
          if (!settings.notifStaffShortage) {
            console.log('[Notification] 人員不足アラートが無効です');
            return;
          }
          break;
      }
    }

    // userIdが指定されていない場合、userEmailからuser_idを取得
    let resolvedUserId = userId;
    if (!resolvedUserId && userEmail) {
      resolvedUserId = await getUserIdByEmail(userEmail);
    }

    if (!resolvedUserId) {
      console.error('通知作成: ユーザーIDを解決できませんでした', { userEmail, userId });
      return;
    }

    // アプリ内通知を作成（設定で有効な場合）
    if (settings.notifInApp) {
      await insertRecord('Notification', {
        user_id: resolvedUserId,
        title,
        content: message,
        type,
        is_read: false,
        action_url: actionUrl || null,
      });
    }

    // メール通知を送信（設定で有効な場合）
    if (sendEmail && userEmail && settings.notifEmail) {
      const appUrl = 'https://shift-app-liart.vercel.app';
      const emailHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">📋 ${title}</h2>
          </div>
          <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef;">
            <p style="color: #333; line-height: 1.6; white-space: pre-line;">${message}</p>
          </div>
          <div style="padding: 20px; text-align: center;">
            <a href="${actionUrl || appUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">アプリで確認する</a>
          </div>
          <div style="padding: 10px; text-align: center; color: #999; font-size: 12px;">
            <p>このメールは舞昆シフト管理システムから自動送信されています。</p>
          </div>
        </div>
      `;
      const emailPayload = {
        to: userEmail,
        subject: `[シフト管理] ${title}`,
        body: `${title}\n\n${message}\n\nアプリで確認: ${actionUrl || appUrl}\n\n---\nこのメールは自動送信されています。`,
        html: emailHtml,
      };
      // PDF添付がある場合
      if (pdfAttachment) {
        emailPayload.attachments = [{
          filename: pdfAttachment.filename || 'シフト表.pdf',
          content: pdfAttachment.content, // base64
        }];
      }
      await sendEmailNotification(emailPayload);
    }

    // LINE通知（設定で有効な場合）
    if (sendLine && settings.notifLine) {
      // ユーザーのLINE IDを取得（fetchAllではなくfetchFilteredで効率化）
      let lineUserId = null;
      if (resolvedUserId) {
        try {
          const targetUsers = await fetchFiltered('User', { id: resolvedUserId });
          lineUserId = targetUsers?.[0]?.line_user_id || null;
        } catch (e) {
          console.warn('[Notification] LINEユーザーID取得失敗:', e);
        }
      }

      const lineMessage = `【シフト管理】${title}\n${message}`;
      if (lineUserId) {
        // 個別ユーザーにプッシュ送信
        await sendLineNotification({
          userId: lineUserId,
          message: lineMessage,
        });
      } else {
        // LINE User IDがない場合はブロードキャスト送信にフォールバック
        console.log('[Notification] LINE User IDがないためブロードキャスト送信');
        await sendLineBroadcast({ message: lineMessage });
      }
    }
  } catch (error) {
    console.error('通知の作成に失敗しました:', error);
  }
}

// シフト確定通知
export async function notifyShiftConfirmed({ shift, storeName, pdfAttachment = null }) {
  await createNotification({
    userEmail: shift.user_email || shift.created_by,
    title: 'シフトが確定されました',
    message: `${storeName}の${format(new Date(shift.date), 'M月d日(E)', { locale: ja })}のシフトが確定されました。\n時間: ${shift.start_time} - ${shift.end_time}${pdfAttachment ? '\n\nPDF添付: シフト表.pdf' : ''}`,
    type: 'shift_change',
    relatedId: shift.id,
    notificationType: 'shift_confirm',
    pdfAttachment
  });
}

// シフト変更通知
export async function notifyShiftChanged({ shift, storeName, changes }) {
  await createNotification({
    userEmail: shift.user_email || shift.created_by,
    title: 'シフトが変更されました',
    message: `${storeName}の${format(new Date(shift.date), 'M月d日(E)', { locale: ja })}のシフトが変更されました。\n${changes}\n新しい時間: ${shift.start_time} - ${shift.end_time}`,
    type: 'shift_change',
    relatedId: shift.id,
    notificationType: 'shift_change'
  });
}

// シフト削除通知
export async function notifyShiftDeleted({ userEmail, date, storeName }) {
  await createNotification({
    userEmail,
    title: 'シフトが削除されました',
    message: `${storeName}の${format(new Date(date), 'M月d日(E)', { locale: ja })}のシフトが削除されました。`,
    type: 'shift_change',
    notificationType: 'shift_change'
  });
}

// 勤務時間上限超過アラート
export async function notifyWorkHoursExceeded({ userEmail, hours, limit, period }) {
  await createNotification({
    userEmail,
    title: '勤務時間が上限を超えています',
    message: `${period}の勤務時間が${hours}時間となり、設定された上限（${limit}時間）を超えました。休息を取ることをお勧めします。`,
    type: 'system'
  });
}

// 残業時間超過アラート
export async function notifyOvertimeExceeded({ userEmail, overtimeHours, limit, period }) {
  await createNotification({
    userEmail,
    title: '残業時間が上限を超えています',
    message: `${period}の残業時間が${overtimeHours}時間となり、設定された上限（${limit}時間）を超えました。`,
    type: 'system'
  });
}

// 締切リマインダー通知
export async function notifyDeadlineReminder({ userEmail, storeName, deadline, targetMonth }) {
  await createNotification({
    userEmail,
    title: `シフト希望提出期限のお知らせ`,
    message: `${storeName}の${targetMonth}分シフト希望の提出期限は${deadline}です。お早めにご提出ください。`,
    type: 'deadline',
    notificationType: 'deadline_reminder'
  });
}

// 人員不足アラート（管理者向け）
export async function notifyStaffShortage({ adminEmail, storeName, date, requiredStaff, currentStaff, timeSlot }) {
  await createNotification({
    userEmail: adminEmail,
    title: '人員不足が発生しています',
    message: `${storeName}の${format(new Date(date), 'M月d日(E)', { locale: ja })} ${timeSlot}に人員不足が発生しています。\n必要人数: ${requiredStaff}名\n現在の配置: ${currentStaff}名\n不足: ${requiredStaff - currentStaff}名`,
    type: 'system',
    notificationType: 'staff_shortage'
  });
}

// 有給申請通知（管理者・マネージャー向け）
export async function notifyPaidLeaveRequest({ adminEmails, userName, date, reason }) {
  for (const adminEmail of adminEmails) {
    await createNotification({
      userEmail: adminEmail,
      title: '有給申請が提出されました',
      message: `${userName}さんが${format(new Date(date), 'M月d日(E)', { locale: ja })}の有給休暇を申請しました。${reason ? '\n理由: ' + reason : ''}\n有給管理画面から承認・却下を行ってください。`,
      type: 'paid_leave',
      notificationType: 'paid_leave'
    });
  }
}

// 有給承認通知（申請者向け）
export async function notifyPaidLeaveApproved({ userEmail, date }) {
  await createNotification({
    userEmail,
    title: '有給申請が承認されました',
    message: `${format(new Date(date), 'M月d日(E)', { locale: ja })}の有給休暇申請が承認されました。`,
    type: 'paid_leave',
    notificationType: 'paid_leave'
  });
}

// 有給却下通知（申請者向け）
export async function notifyPaidLeaveRejected({ userEmail, date, reason }) {
  await createNotification({
    userEmail,
    title: '有給申請が却下されました',
    message: `${format(new Date(date), 'M月d日(E)', { locale: ja })}の有給休暇申請が却下されました。${reason ? '\n理由: ' + reason : ''}`,
    type: 'paid_leave',
    notificationType: 'paid_leave'
  });
}

// シフト希望受付通知（管理者向け）
export async function notifyShiftRequestReceived({ adminEmails, userName, storeName, date }) {
  for (const adminEmail of adminEmails) {
    await createNotification({
      userEmail: adminEmail,
      title: '新しいシフト希望が提出されました',
      message: `${userName}さんが${storeName}の${format(new Date(date), 'M月d日(E)', { locale: ja })}のシフト希望を提出しました。`,
      type: 'shift_request',
      sendEmail: false
    });
  }
}

// 一括通知（複数ユーザーに同じ通知を送信）
export async function notifyMultipleUsers({ userEmails, title, message, type, notificationType = null }) {
  const promises = userEmails.map(userEmail => 
    createNotification({ userEmail, title, message, type, notificationType })
  );
  await Promise.all(promises);
}
