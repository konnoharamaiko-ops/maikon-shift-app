/**
 * 管理者専用ユーザー操作API
 * service_role キーをサーバ側に隔離し、クライアントへ同梱しないための代替経路。
 *
 * POST /api/admin/users   body: { action, ...payload }
 *   action: update_row | list_users | create_user | update_user | generate_link | delete_user
 * 認証: 呼び出し元が User.user_role === 'admin' であることをサーバ側で検証。
 * 戻り値: Supabase ネイティブの { data, error } 形状を維持（フロントの呼び出し側を無改修で動かすため）。
 */
import { createClient } from '@supabase/supabase-js';
import { applyCors, requireAdmin, getSupabaseConfig } from '../_lib/security.js';

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: 'POST,OPTIONS' })) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Service role key is not configured on the server' });
  }
  const svc = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const body = req.body || {};
  const { action } = body;

  try {
    switch (action) {
      case 'update_row': {
        const { table, data, match } = body;
        if (table !== 'User') return res.status(400).json({ error: 'Unsupported table' });
        if (!match || !match.column || match.value === undefined) {
          return res.status(400).json({ error: 'match.column and match.value are required' });
        }
        const { data: d, error } = await svc.from('User').update(data).eq(match.column, match.value);
        return res.status(200).json({ data: d, error });
      }
      case 'list_users': {
        const { data, error } = await svc.auth.admin.listUsers();
        return res.status(200).json({ data, error });
      }
      case 'create_user': {
        const { data, error } = await svc.auth.admin.createUser(body.attrs || {});
        return res.status(200).json({ data, error });
      }
      case 'update_user': {
        if (!body.id) return res.status(400).json({ error: 'id is required' });
        const { data, error } = await svc.auth.admin.updateUserById(body.id, body.attrs || {});
        return res.status(200).json({ data, error });
      }
      case 'generate_link': {
        const { data, error } = await svc.auth.admin.generateLink(body.opts || {});
        return res.status(200).json({ data, error });
      }
      case 'delete_user': {
        if (!body.id) return res.status(400).json({ error: 'id is required' });
        const { data, error } = await svc.auth.admin.deleteUser(body.id);
        return res.status(200).json({ data, error });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Admin operation failed', message: e.message });
  }
}
