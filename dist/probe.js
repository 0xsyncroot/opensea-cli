import { FunctionFragment, Interface } from 'ethers';
const READ_CANDIDATES = [
    { sig: 'function name() view returns (string)', label: 'name' },
    { sig: 'function symbol() view returns (string)', label: 'symbol' },
    { sig: 'function totalSupply() view returns (uint256)', label: 'totalSupply' },
    { sig: 'function MAX_SUPPLY() view returns (uint256)', label: 'MAX_SUPPLY' },
    { sig: 'function maxSupply() view returns (uint256)', label: 'maxSupply' },
    { sig: 'function MAX_TOKENS() view returns (uint256)', label: 'MAX_TOKENS' },
    { sig: 'function owner() view returns (address)', label: 'owner' },
    { sig: 'function paused() view returns (bool)', label: 'paused' },
    { sig: 'function saleIsActive() view returns (bool)', label: 'saleIsActive' },
    { sig: 'function publicMintActive() view returns (bool)', label: 'publicMintActive' },
    { sig: 'function isMintActive() view returns (bool)', label: 'isMintActive' },
    { sig: 'function mintActive() view returns (bool)', label: 'mintActive' },
    { sig: 'function publicSaleActive() view returns (bool)', label: 'publicSaleActive' },
    { sig: 'function publicSaleStartTime() view returns (uint256)', label: 'publicSaleStartTime' },
    { sig: 'function mintStartTime() view returns (uint256)', label: 'mintStartTime' },
    { sig: 'function mintStart() view returns (uint256)', label: 'mintStart' },
    { sig: 'function price() view returns (uint256)', label: 'price' },
    { sig: 'function mintPrice() view returns (uint256)', label: 'mintPrice' },
    { sig: 'function cost() view returns (uint256)', label: 'cost' },
    { sig: 'function publicSalePrice() view returns (uint256)', label: 'publicSalePrice' },
    { sig: 'function PUBLIC_PRICE() view returns (uint256)', label: 'PUBLIC_PRICE' },
    { sig: 'function MINT_PRICE() view returns (uint256)', label: 'MINT_PRICE' },
    { sig: 'function maxPerWallet() view returns (uint256)', label: 'maxPerWallet' },
    { sig: 'function maxMintPerTx() view returns (uint256)', label: 'maxMintPerTx' },
    { sig: 'function MAX_PER_WALLET() view returns (uint256)', label: 'MAX_PER_WALLET' },
];
export async function probeContract(provider, address) {
    const out = [];
    // Run probes in parallel but small batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < READ_CANDIDATES.length; i += batchSize) {
        const slice = READ_CANDIDATES.slice(i, i + batchSize);
        const results = await Promise.allSettled(slice.map(async ({ sig, label }) => {
            const iface = new Interface([sig]);
            const fn = FunctionFragment.from(sig);
            const data = iface.encodeFunctionData(fn);
            const raw = await provider.call({ to: address, data });
            if (raw === '0x' || raw.length <= 2)
                throw new Error('empty return');
            const decoded = iface.decodeFunctionResult(fn, raw);
            const v = decoded[0];
            let str;
            if (typeof v === 'bigint')
                str = v.toString();
            else if (typeof v === 'boolean')
                str = v ? 'true' : 'false';
            else
                str = String(v);
            return { label, value: str };
        }));
        for (const r of results) {
            if (r.status === 'fulfilled')
                out.push(r.value);
        }
    }
    return out;
}
export function findProbe(probes, labels) {
    for (const l of labels) {
        const p = probes.find((x) => x.label === l);
        if (p)
            return p;
    }
    return null;
}
export const PRICE_LABELS = ['price', 'mintPrice', 'publicSalePrice', 'cost', 'PUBLIC_PRICE', 'MINT_PRICE'];
export const START_LABELS = ['publicSaleStartTime', 'mintStartTime', 'mintStart'];
export const ACTIVE_LABELS = ['saleIsActive', 'publicMintActive', 'isMintActive', 'mintActive', 'publicSaleActive'];
export const MAX_PER_WALLET_LABELS = ['maxPerWallet', 'MAX_PER_WALLET', 'maxMintPerTx'];
export const MAX_SUPPLY_LABELS = ['MAX_SUPPLY', 'maxSupply', 'MAX_TOKENS'];
export function formatProbeValue(label, value) {
    // price-like fields → also show as ETH if it's a big wei number
    if (/price|cost|PRICE/.test(label)) {
        try {
            const wei = BigInt(value);
            if (wei > 1000000000000n) {
                const eth = Number(wei) / 1e18;
                return `${value}  (${eth.toFixed(6)} ETH)`;
            }
        }
        catch { /* not a number */ }
    }
    // timestamps → ISO
    if (/Start(Time)?|mintStart/.test(label)) {
        try {
            const n = Number(value);
            if (n > 1_500_000_000 && n < 5_000_000_000) {
                return `${value}  (${new Date(n * 1000).toISOString()})`;
            }
        }
        catch { /* */ }
    }
    return value;
}
