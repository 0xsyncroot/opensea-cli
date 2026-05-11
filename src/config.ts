import { config as dotenvConfig } from 'dotenv';
import { parseEther, getAddress } from 'ethers';
import type { Flags } from './args.js';

export interface Config {
  rpcUrl: string;
  relays: string[];
  flashbotsAuthKey?: string;
  chainId: number;
  contract: string;
  mintFunction: string;
  mintArgs: unknown[];
  quantity: number;
  mintValueWei: bigint;
  gasLimit: bigint;
  maxPriorityFeeGwei: number;
  maxFeeGwei: number;
  blocksToTarget: number;
  mintStartTs?: number;
  mintStartBlock?: number;
  preflightLeadSec: number;
  adaptive?: { percentile: number; premiumGwei: number };
  // Track what user explicitly provided so we can auto-fill the rest from the contract
  priceExplicit: boolean;
  fnExplicit: boolean;
  startExplicit: boolean;
}

function need(v: string | undefined, name: string, hint: string): string {
  if (!v) throw new Error(`Missing ${name}. Pass ${hint} or set in .env.`);
  return v;
}

function pickAdaptive(raw: string | undefined): Config['adaptive'] {
  if (!raw) return undefined;
  const t = raw.trim();
  // accept "auto", "auto:75+0.5", "75+0.5"
  if (t === 'auto') return { percentile: 75, premiumGwei: 0.5 };
  const body = t.startsWith('auto:') ? t.slice(5) : t;
  const m = /^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/.exec(body);
  if (!m) return undefined;
  return { percentile: Number(m[1]), premiumGwei: Number(m[2]) };
}

function isAdaptive(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw === 'auto' || raw.startsWith('auto:') || /^\d+(?:\.\d+)?\+\d+(?:\.\d+)?$/.test(raw);
}

// Sensible defaults so users only need --contract for free mints, or
// --contract + --price for paid mints. Override anything via flag or env.
const DEFAULTS = {
  RPC:      'https://ethereum-rpc.publicnode.com',
  RELAYS:   'https://relay.flashbots.net,https://rpc.titanbuilder.xyz,https://rpc.beaverbuild.org,https://rsync-builder.xyz,https://rpc.payload.de,https://api.blocknative.com/v1/auction',
  FN:       'mint(uint256)',
  ARGS:     '["qty"]',
  QTY:      '1',
  PRICE:    '0',
  GAS:      '300000',
  PRIORITY: 'auto:75+0.5',   // adaptive: p75 of last 5 blocks + 0.5 gwei premium
  MAX_FEE:  '100',
  BLOCKS:   '3',
} as const;

export function loadConfig(flags: Flags = { command: 'help' }): Config {
  // Load env from --env path, or default .env (silent if absent)
  dotenvConfig({ path: flags.envPath, override: false });
  const env = process.env;

  const rpcUrl       = flags.rpc      ?? env.RPC_URL                  ?? DEFAULTS.RPC;
  const contractRaw  = need(flags.contract ?? env.CONTRACT_ADDRESS, 'contract', '--contract 0x...');
  let contract: string;
  try { contract = getAddress(contractRaw); }
  catch { throw new Error(`Invalid contract address: ${contractRaw}. Expected a 20-byte hex like 0xe10e2689...`); }
  const mintFunction = flags.fn       ?? env.MINT_FUNCTION_SIGNATURE ?? DEFAULTS.FN;

  const quantity     = Number(flags.qty ?? env.MINT_QUANTITY ?? DEFAULTS.QTY);
  const pricePerToken = flags.price   ?? env.MINT_PRICE_ETH          ?? DEFAULTS.PRICE;
  const mintValueWei = parseEther(pricePerToken) * BigInt(quantity);

  const rawArgs      = flags.args     ?? env.MINT_ARGS               ?? DEFAULTS.ARGS;
  let mintArgs: unknown[];
  try {
    mintArgs = JSON.parse(rawArgs);
    if (!Array.isArray(mintArgs)) throw new Error('not an array');
  } catch {
    throw new Error(`--args/MINT_ARGS must be a JSON array, e.g. '["qty"]' — got: ${rawArgs}`);
  }

  const relayCsv = flags.relays ?? env.RELAYS ?? env.FLASHBOTS_RELAY ?? DEFAULTS.RELAYS;
  const relays = relayCsv.split(',').map((s) => s.trim()).filter(Boolean);

  // Priority: flags --priority wins. Accepts a gwei number OR adaptive form.
  const rawPriority = flags.priority ?? env.ADAPTIVE_PRIORITY ?? env.MAX_PRIORITY_FEE_GWEI ?? DEFAULTS.PRIORITY;
  let maxPriorityFeeGwei: number;
  let adaptive: Config['adaptive'];
  if (rawPriority === 'auto' || rawPriority.startsWith('auto:') || /^\d+(?:\.\d+)?\+\d+(?:\.\d+)?$/.test(rawPriority)) {
    adaptive = pickAdaptive(rawPriority);
    if (!adaptive) {
      throw new Error(`Invalid --priority "${rawPriority}". Use a number ("2" = 2 gwei), "auto", or "auto:<pct>+<gwei>" e.g. "auto:75+0.5".`);
    }
    maxPriorityFeeGwei = Number(env.MAX_PRIORITY_FEE_GWEI ?? '50');
  } else {
    const n = Number(rawPriority);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Invalid --priority "${rawPriority}". Use a number ("2" = 2 gwei), "auto", or "auto:<pct>+<gwei>".`);
    }
    maxPriorityFeeGwei = n;
  }

  return {
    rpcUrl,
    relays,
    flashbotsAuthKey: flags.authKey ?? env.FLASHBOTS_AUTH_KEY ?? undefined,
    chainId: Number(flags.chain ?? env.CHAIN_ID ?? '1'),
    contract,
    mintFunction,
    mintArgs,
    quantity,
    mintValueWei,
    gasLimit: BigInt(flags.gasLimit ?? env.GAS_LIMIT ?? DEFAULTS.GAS),
    maxPriorityFeeGwei,
    maxFeeGwei: Number(flags.maxFee ?? env.MAX_FEE_GWEI ?? DEFAULTS.MAX_FEE),
    blocksToTarget: Number(flags.blocks ?? env.BLOCKS_TO_TARGET ?? DEFAULTS.BLOCKS),
    mintStartTs: (flags.startTs ?? env.MINT_START_TS) ? Number(flags.startTs ?? env.MINT_START_TS) : undefined,
    mintStartBlock: (flags.startBlock ?? env.MINT_START_BLOCK) ? Number(flags.startBlock ?? env.MINT_START_BLOCK) : undefined,
    preflightLeadSec: Number(flags.preflightLead ?? env.PREFLIGHT_LEAD_SEC ?? '30'),
    adaptive,
    priceExplicit: flags.price != null || env.MINT_PRICE_ETH != null,
    fnExplicit:    flags.fn    != null || env.MINT_FUNCTION_SIGNATURE != null,
    startExplicit: (flags.startTs ?? flags.startBlock ?? env.MINT_START_TS ?? env.MINT_START_BLOCK) != null,
  };
}
