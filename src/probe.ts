import { JsonRpcProvider, FunctionFragment, Interface } from 'ethers';

const READ_CANDIDATES: Array<{ sig: string; label: string }> = [
  { sig: 'function name() view returns (string)',         label: 'name' },
  { sig: 'function symbol() view returns (string)',       label: 'symbol' },
  { sig: 'function totalSupply() view returns (uint256)', label: 'totalSupply' },
  { sig: 'function MAX_SUPPLY() view returns (uint256)',  label: 'MAX_SUPPLY' },
  { sig: 'function maxSupply() view returns (uint256)',   label: 'maxSupply' },
  { sig: 'function MAX_TOKENS() view returns (uint256)',  label: 'MAX_TOKENS' },
  { sig: 'function owner() view returns (address)',       label: 'owner' },
  { sig: 'function paused() view returns (bool)',         label: 'paused' },
  { sig: 'function saleIsActive() view returns (bool)',   label: 'saleIsActive' },
  { sig: 'function publicMintActive() view returns (bool)', label: 'publicMintActive' },
  { sig: 'function isMintActive() view returns (bool)',   label: 'isMintActive' },
  { sig: 'function mintActive() view returns (bool)',     label: 'mintActive' },
  { sig: 'function publicSaleActive() view returns (bool)', label: 'publicSaleActive' },
  { sig: 'function publicSaleStartTime() view returns (uint256)', label: 'publicSaleStartTime' },
  { sig: 'function mintStartTime() view returns (uint256)', label: 'mintStartTime' },
  { sig: 'function mintStart() view returns (uint256)',   label: 'mintStart' },
  { sig: 'function price() view returns (uint256)',       label: 'price' },
  { sig: 'function mintPrice() view returns (uint256)',   label: 'mintPrice' },
  { sig: 'function cost() view returns (uint256)',        label: 'cost' },
  { sig: 'function publicSalePrice() view returns (uint256)', label: 'publicSalePrice' },
  { sig: 'function PUBLIC_PRICE() view returns (uint256)', label: 'PUBLIC_PRICE' },
  { sig: 'function MINT_PRICE() view returns (uint256)',  label: 'MINT_PRICE' },
  { sig: 'function maxPerWallet() view returns (uint256)', label: 'maxPerWallet' },
  { sig: 'function maxMintPerTx() view returns (uint256)', label: 'maxMintPerTx' },
  { sig: 'function MAX_PER_WALLET() view returns (uint256)', label: 'MAX_PER_WALLET' },
];

export type ProbeResult = { label: string; value: string };

export async function probeContract(
  provider: JsonRpcProvider,
  address: string,
): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  // Run probes in parallel but small batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < READ_CANDIDATES.length; i += batchSize) {
    const slice = READ_CANDIDATES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      slice.map(async ({ sig, label }) => {
        const iface = new Interface([sig]);
        const fn = FunctionFragment.from(sig);
        const data = iface.encodeFunctionData(fn);
        const raw = await provider.call({ to: address, data });
        if (raw === '0x' || raw.length <= 2) throw new Error('empty return');
        const decoded = iface.decodeFunctionResult(fn, raw);
        const v = decoded[0];
        let str: string;
        if (typeof v === 'bigint') str = v.toString();
        else if (typeof v === 'boolean') str = v ? 'true' : 'false';
        else str = String(v);
        return { label, value: str };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') out.push(r.value);
    }
  }
  return out;
}

export function findProbe(probes: ProbeResult[], labels: string[]): { label: string; value: string } | null {
  for (const l of labels) {
    const p = probes.find((x) => x.label === l);
    if (p) return p;
  }
  return null;
}

export const PRICE_LABELS = ['price', 'mintPrice', 'publicSalePrice', 'cost', 'PUBLIC_PRICE', 'MINT_PRICE'];
export const START_LABELS = ['publicSaleStartTime', 'mintStartTime', 'mintStart'];
export const ACTIVE_LABELS = ['saleIsActive', 'publicMintActive', 'isMintActive', 'mintActive', 'publicSaleActive'];
export const MAX_PER_WALLET_LABELS = ['maxPerWallet', 'MAX_PER_WALLET', 'maxMintPerTx'];
export const MAX_SUPPLY_LABELS = ['MAX_SUPPLY', 'maxSupply', 'MAX_TOKENS'];

/**
 * Probe a sale-contract pattern (Transient Labs TLStacks721 currently).
 * Returns drop config when `saleContract` has a configured `getDrop(nft)` row.
 * Returns null on any failure — caller should treat as "not a TLStacks drop".
 */
export interface SaleDrop {
  kind: 'tlstacks';
  publicCostWei: bigint;
  protocolFeeWei: bigint;
  totalPerTokenWei: bigint;
  publicOpensTs: number;       // 0 if open-ended without a clear schedule
  publicEndsTs: number;        // 0 if open-ended
  supplyRemaining: bigint;
  allowancePerWallet: bigint;
  currency: string;            // zero address = ETH
  phase: number;               // 0..4
}

const TL_DROP_TUPLE =
  'tuple(uint8 dropType, address payoutReceiver, uint256 initialSupply, uint256 supply, uint256 allowance, address currencyAddress, uint256 startTime, uint256 presaleDuration, uint256 presaleCost, bytes32 presaleMerkleRoot, uint256 publicDuration, uint256 publicCost, int256 decayRate, string baseUri)';

export async function probeSaleContract(
  provider: JsonRpcProvider,
  saleContract: string,
  nftAddress: string,
): Promise<SaleDrop | null> {
  try {
    const iface = new Interface([
      `function getDrop(address) view returns (${TL_DROP_TUPLE})`,
      'function protocolFee() view returns (uint256)',
      'function getDropPhase(address) view returns (uint8)',
    ]);
    const [dropRaw, feeRaw, phaseRaw] = await Promise.all([
      provider.call({ to: saleContract, data: iface.encodeFunctionData('getDrop', [nftAddress]) }).catch(() => '0x'),
      provider.call({ to: saleContract, data: iface.encodeFunctionData('protocolFee', []) }).catch(() => '0x'),
      provider.call({ to: saleContract, data: iface.encodeFunctionData('getDropPhase', [nftAddress]) }).catch(() => '0x'),
    ]);
    if (dropRaw === '0x' || dropRaw.length <= 2) return null;
    const [drop] = iface.decodeFunctionResult('getDrop', dropRaw) as unknown as [{
      dropType: bigint; payoutReceiver: string; initialSupply: bigint; supply: bigint;
      allowance: bigint; currencyAddress: string; startTime: bigint; presaleDuration: bigint;
      presaleCost: bigint; presaleMerkleRoot: string; publicDuration: bigint; publicCost: bigint;
      decayRate: bigint; baseUri: string;
    }];
    if (drop.dropType === 0n) return null;
    const fee = feeRaw !== '0x' ? (iface.decodeFunctionResult('protocolFee', feeRaw)[0] as bigint) : 0n;
    const phase = phaseRaw !== '0x' ? Number(iface.decodeFunctionResult('getDropPhase', phaseRaw)[0]) : 0;
    const publicOpensTs = Number(drop.startTime) + Number(drop.presaleDuration);
    const publicEndsTs = drop.publicDuration > 0n ? publicOpensTs + Number(drop.publicDuration) : 0;
    return {
      kind: 'tlstacks',
      publicCostWei: drop.publicCost,
      protocolFeeWei: fee,
      totalPerTokenWei: drop.publicCost + fee,
      publicOpensTs,
      publicEndsTs,
      supplyRemaining: drop.supply,
      allowancePerWallet: drop.allowance,
      currency: drop.currencyAddress,
      phase,
    };
  } catch {
    return null;
  }
}

export function formatProbeValue(label: string, value: string): string {
  // price-like fields → also show as ETH if it's a big wei number
  if (/price|cost|PRICE/.test(label)) {
    try {
      const wei = BigInt(value);
      if (wei > 1_000_000_000_000n) {
        const eth = Number(wei) / 1e18;
        return `${value}  (${eth.toFixed(6)} ETH)`;
      }
    } catch { /* not a number */ }
  }
  // timestamps → ISO
  if (/Start(Time)?|mintStart/.test(label)) {
    try {
      const n = Number(value);
      if (n > 1_500_000_000 && n < 5_000_000_000) {
        return `${value}  (${new Date(n * 1000).toISOString()})`;
      }
    } catch { /* */ }
  }
  return value;
}
