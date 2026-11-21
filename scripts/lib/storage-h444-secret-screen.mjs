// Defense in depth for reviewed projections, not proof that arbitrary text is safe.
import {ExportHold} from './storage-h444-exporter.mjs';
const fields = /^(?:encrypted_password|password|password_hash|confirmation_token|recovery_token|reauthentication_token|email_change_token_(?:new|current)|phone_change_token|raw_app_meta_data|raw_user_meta_data|(?:encrypted_)?(?:access_token|refresh_token)|client_secret|api_key|private_key|authorization)$/i;
export function checkExportScope(tables) {
  for (const table of tables) {
    if (/^(?:vault\.|auth\.(?!users$))/.test(table.name) || /(?:credential_generations|job_secrets)$/.test(table.name)
      || table.columns.some(c => fields.test(c))) throw new ExportHold('secret_scope_forbidden');
  }
}
export function screenExportValue(value) {
  if (Array.isArray(value)) {for (const item of value) screenExportValue(item);return;}
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    for (const [key,item] of Object.entries(value)) {
      if (fields.test(key) && item !== null && item !== '') throw new ExportHold('secret_content_detected');
      screenExportValue(item);
    }
    return;
  }
  const text=Buffer.isBuffer(value)?new TextDecoder('utf-8',{fatal:true}).decode(value):typeof value==='string'?value:'';
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk|rk)[-_](?:live_|test_|proj-)?[A-Za-z0-9_-]{20,}|\bBearer\s+[A-Za-z0-9._~-]{16,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@]+@|\bPASSWORD\s+'[^']+'|["'](?:api_key|client_secret|(?:encrypted_)?(?:access_token|refresh_token)|password|authorization)["']\s*[:=]\s*["'][^"']+["']/i.test(text)) throw new ExportHold('secret_content_detected');
}
