import { id } from 'ethers';

export interface AuthSigner {
  address: string;
  signMessage(message: string): Promise<string>;
}

export interface BundleResult {
  bundleHash: string;
}

export interface CallBundleResult {
  bundleGasPrice?: string;
  bundleHash?: string;
  coinbaseDiff?: string;
  ethSentToCoinbase?: string;
  gasFees?: string;
  results?: Array<{
    txHash?: string;
    gasUsed?: number;
    gasPrice?: string;
    value?: string;
    error?: string;
    revert?: string;
  }>;
  stateBlockNumber?: number;
  totalGasUsed?: number;
}

export class Flashbots {
  constructor(private relayUrl: string, private auth: AuthSigner) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const sig = await this.auth.signMessage(id(body));
    const r = await fetch(this.relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Flashbots-Signature': `${this.auth.address}:${sig}`,
      },
      body,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`relay HTTP ${r.status}: ${text}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`relay returned non-JSON: ${text}`); }
    if (json.error) throw new Error(`relay: ${json.error.message ?? JSON.stringify(json.error)}`);
    return json.result;
  }

  sendBundle(signedTxs: string[], targetBlock: number): Promise<BundleResult> {
    return this.rpc('eth_sendBundle', [{
      txs: signedTxs,
      blockNumber: '0x' + targetBlock.toString(16),
    }]);
  }

  callBundle(signedTxs: string[], targetBlock: number): Promise<CallBundleResult> {
    return this.rpc('eth_callBundle', [{
      txs: signedTxs,
      blockNumber: '0x' + targetBlock.toString(16),
      stateBlockNumber: 'latest',
    }]);
  }

  bundleStats(bundleHash: string, targetBlock: number) {
    return this.rpc('flashbots_getBundleStatsV2', [{
      bundleHash,
      blockNumber: '0x' + targetBlock.toString(16),
    }]);
  }
}
