import prompts from 'prompts';
import { log } from './logger.js';

function normalizeKey(raw: string): string {
  const k = raw.trim();
  const stripped = k.startsWith('0x') ? k.slice(2) : k;
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    throw new Error('private key must be 32 bytes hex (with or without 0x prefix)');
  }
  return '0x' + stripped.toLowerCase();
}

export async function loadPrivateKey(opts: { privateKey?: string }): Promise<string> {
  if (opts.privateKey) {
    log.warn('private key passed via --private-key — visible in shell history & `ps`. Clear history if shared host.');
    return normalizeKey(opts.privateKey);
  }
  const res = await prompts(
    {
      type: 'password',
      name: 'key',
      message: 'Private key (hidden input)',
      validate: (v: string) => {
        const t = (v ?? '').trim();
        if (!t) return 'Required';
        const hex = t.startsWith('0x') ? t.slice(2) : t;
        if (!/^[0-9a-fA-F]{64}$/.test(hex)) return 'Must be 32-byte hex';
        return true;
      },
    },
    { onCancel: () => process.exit(1) },
  );
  return normalizeKey(res.key as string);
}

export async function confirm(message: string, initial = false): Promise<boolean> {
  const res = await prompts(
    { type: 'confirm', name: 'ok', message, initial },
    { onCancel: () => process.exit(1) },
  );
  return Boolean(res.ok);
}
