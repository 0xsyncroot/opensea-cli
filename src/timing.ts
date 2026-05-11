import { JsonRpcProvider, formatUnits } from 'ethers';
import chalk from 'chalk';
import { log } from './logger.js';

const ETH_BLOCK_TIME_MS = 12_000;

export async function countdown(seconds: number, label: string): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    const line = `    ${chalk.yellow(label)} ${chalk.red.bold(String(i).padStart(2))}s  ${chalk.gray('(Ctrl+C to abort)')}`;
    process.stdout.write('\r' + line + ' '.repeat(10));
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

export async function clockDrift(provider: JsonRpcProvider) {
  const t0 = Date.now();
  const block = await provider.getBlock('latest');
  const t1 = Date.now();
  if (!block) throw new Error('no latest block');
  const rtt = t1 - t0;
  const localUnix = Math.floor((t0 + rtt / 2) / 1000);
  const driftSec = localUnix - Number(block.timestamp);
  return { headBlock: block.number, blockTs: Number(block.timestamp), localUnix, rtt, driftSec };
}

// Sleep cancelable via Ctrl+C — print a status line periodically.
export async function waitUntilUnix(targetTs: number, untilTs?: number) {
  const stopAt = untilTs ?? targetTs;
  const total = stopAt - Math.floor(Date.now() / 1000);
  if (total <= 0) return;
  log.step(`Waiting ${total}s ${untilTs ? `(stops at ${new Date(stopAt * 1000).toISOString()})` : `until ${new Date(targetTs * 1000).toISOString()}`}`);
  log.dim('Ctrl+C to abort at any time — nothing has been submitted yet.');
  let lastTick = 0;
  while (Math.floor(Date.now() / 1000) < stopAt) {
    const now = Math.floor(Date.now() / 1000);
    const remaining = stopAt - now;
    if (remaining !== lastTick && (remaining <= 10 || remaining % 30 === 0 || remaining === total - 1)) {
      const mm = Math.floor(remaining / 60), ss = remaining % 60;
      process.stdout.write('\r    ' + chalk.gray(`waiting…  T-${mm}m${String(ss).padStart(2, '0')}s     `));
      lastTick = remaining;
    }
    await new Promise((r) => setTimeout(r, remaining > 5 ? 500 : 50));
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
}

export async function waitUntilBlock(provider: JsonRpcProvider, targetBlock: number, untilBlock?: number) {
  const stopAt = untilBlock ?? (targetBlock - 1);
  log.step(`Waiting for block ${stopAt}${untilBlock ? ` (lead before target ${targetBlock})` : ''}`);
  log.dim('Ctrl+C to abort at any time — nothing has been submitted yet.');
  let prev = 0;
  while (true) {
    const head = await provider.getBlockNumber();
    if (head >= stopAt) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      log.ok(`head=${head}, proceeding`);
      return;
    }
    const left = stopAt - head;
    if (head !== prev) {
      const eta = (left * ETH_BLOCK_TIME_MS) / 1000;
      process.stdout.write('\r    ' + chalk.gray(`head=${head}, need=${stopAt}, ~${eta.toFixed(0)}s         `));
      prev = head;
    }
    const sleep = Math.min(8000, Math.max(500, left * ETH_BLOCK_TIME_MS * 0.7));
    await new Promise((r) => setTimeout(r, sleep));
  }
}

export async function feeHistoryPercentiles(
  provider: JsonRpcProvider,
  percentiles: number[],
  blocks = 5,
): Promise<Record<number, bigint>> {
  const hist: any = await provider.send('eth_feeHistory', [
    '0x' + blocks.toString(16),
    'latest',
    percentiles,
  ]);
  const rows: string[][] = hist.reward ?? [];
  const out: Record<number, bigint> = {};
  percentiles.forEach((p, idx) => {
    const col = rows.map((r) => BigInt(r[idx] ?? '0x0'));
    const sorted = [...col].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    out[p] = sorted[Math.floor(sorted.length / 2)] ?? 0n;
  });
  return out;
}

export async function feeHistoryPriority(
  provider: JsonRpcProvider,
  percentile: number,
  blocks = 5,
): Promise<{ value: bigint }> {
  const map = await feeHistoryPercentiles(provider, [percentile], blocks);
  return { value: map[percentile] ?? 0n };
}

export function gwei(b: bigint) { return formatUnits(b, 'gwei'); }
