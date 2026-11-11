import { createHash } from 'node:crypto';

export type ScriptPublicationInput = {
  workspace_id: string; operation_id: string; expected_revision: number;
  expected_hash: string | null; text: string;
};
export type PublicationOperation = {
  state: string; operation_id: string; storage_key?: string; sha256?: string; bytes?: number;
  receipt?: Record<string, unknown> | null;
};
export type PublicationAdapters = {
  command: (command: string, input?: ScriptPublicationInput & { sha256: string; bytes: number }) => Promise<PublicationOperation>;
  upload: (key: string, bytes: Uint8Array) => Promise<void>;
  read: (key: string) => Promise<Uint8Array | null>;
};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** A timeout is deliberately not retried with a new operation identity. */
export async function publishCanonicalScript(input: ScriptPublicationInput, adapters: PublicationAdapters): Promise<PublicationOperation> {
  const text = input.text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').normalize('NFC');
  const bytes = new TextEncoder().encode(text), sha256 = digest(bytes);
  if (!bytes.length || bytes.length > 1048576 || !Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0
    || (input.expected_revision === 0 ? input.expected_hash !== null : !/^[a-f0-9]{64}$/.test(input.expected_hash ?? ''))) {
    throw new Error('invalid_script_publication');
  }
  const operation = await adapters.command('prepare', { ...input, text, sha256, bytes: bytes.length });
  if (operation.operation_id !== input.operation_id) throw new Error('publication_identity_mismatch');
  if (operation.state !== 'prepared') return operation;
  if (!operation.storage_key || operation.sha256 !== sha256 || operation.bytes !== bytes.length) throw new Error('publication_identity_mismatch');
  // Reading first supports retry after an upload acknowledgment was lost. Only a
  // confirmed absence permits creation; adapters must preserve all other failures.
  let staged = await adapters.read(operation.storage_key);
  if (!staged) {
    await adapters.upload(operation.storage_key, bytes);
    staged = await adapters.read(operation.storage_key);
  }
  if (!staged || staged.byteLength !== bytes.length || digest(staged) !== sha256) throw new Error('script_publication_integrity_mismatch');
  return adapters.command('finalize');
}
