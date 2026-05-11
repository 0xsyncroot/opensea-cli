import { id } from 'ethers';
export class Flashbots {
    relayUrl;
    auth;
    constructor(relayUrl, auth) {
        this.relayUrl = relayUrl;
        this.auth = auth;
    }
    async rpc(method, params) {
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
        if (!r.ok)
            throw new Error(`relay HTTP ${r.status}: ${text}`);
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            throw new Error(`relay returned non-JSON: ${text}`);
        }
        if (json.error)
            throw new Error(`relay: ${json.error.message ?? JSON.stringify(json.error)}`);
        return json.result;
    }
    sendBundle(signedTxs, targetBlock) {
        return this.rpc('eth_sendBundle', [{
                txs: signedTxs,
                blockNumber: '0x' + targetBlock.toString(16),
            }]);
    }
    callBundle(signedTxs, targetBlock) {
        return this.rpc('eth_callBundle', [{
                txs: signedTxs,
                blockNumber: '0x' + targetBlock.toString(16),
                stateBlockNumber: 'latest',
            }]);
    }
    bundleStats(bundleHash, targetBlock) {
        return this.rpc('flashbots_getBundleStatsV2', [{
                bundleHash,
                blockNumber: '0x' + targetBlock.toString(16),
            }]);
    }
}
