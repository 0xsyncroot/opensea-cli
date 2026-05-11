import { JsonRpcProvider, Interface, formatEther } from 'ethers';

const RPC = 'https://ethereum-rpc.publicnode.com';
const NFT = '0x52caee4275765dde6f47f874e7cf8181f5b5e5da';
const STACKS = {
  '2.3.0': '0xe920c218c70aa253b10b0e074741cbe50102935e',
  '2.3.1': '0x384092784cfaa91efaa77870c04d958e20840242',
  '2.4.0': '0x9f407d3b312444666426f176e18d964180890ee6',
};

const provider = new JsonRpcProvider(RPC);

const iface = new Interface([
  'function getDrop(address) view returns (tuple(uint8 dropType, address payoutReceiver, uint256 initialSupply, uint256 supply, uint256 allowance, address currencyAddress, uint256 startTime, uint256 presaleDuration, uint256 presaleCost, bytes32 presaleMerkleRoot, uint256 publicDuration, uint256 publicCost, int256 decayRate, string baseUri))',
  'function protocolFee() view returns (uint256)',
  'function getDropPhase(address) view returns (uint8)',
]);

const PHASES = ['NOT_CONFIGURED', 'NOT_STARTED', 'PRESALE', 'PUBLIC_SALE', 'ENDED'];
const DROPTYPE = ['NOT_CONFIGURED', 'REGULAR', 'VELOCITY'];

async function call(addr, method, args) {
  const data = iface.encodeFunctionData(method, args);
  const raw = await provider.call({ to: addr, data });
  return iface.decodeFunctionResult(method, raw);
}

for (const [v, addr] of Object.entries(STACKS)) {
  console.log(`\n━━━━━ TLStacks721 v${v}  ${addr} ━━━━━`);
  try {
    const [drop] = await call(addr, 'getDrop', [NFT]);
    if (drop.dropType === 0n) { console.log('  no drop configured'); continue; }
    const [fee] = await call(addr, 'protocolFee', []);
    const [phase] = await call(addr, 'getDropPhase', [NFT]);

    const start = Number(drop.startTime);
    const presaleEnd = start + Number(drop.presaleDuration);
    const publicEnd = presaleEnd + Number(drop.publicDuration);
    const now = Math.floor(Date.now() / 1000);

    console.log(`  dropType            : ${DROPTYPE[Number(drop.dropType)]}`);
    console.log(`  phase               : ${PHASES[Number(phase)]}`);
    console.log(`  currency            : ${drop.currencyAddress === '0x0000000000000000000000000000000000000000' ? 'ETH' : drop.currencyAddress}`);
    console.log(`  initialSupply       : ${drop.initialSupply}`);
    console.log(`  supply remaining    : ${drop.supply}`);
    console.log(`  per-wallet allowance: ${drop.allowance}  (public)`);
    console.log(`  presaleCost         : ${formatEther(drop.presaleCost)} ETH`);
    console.log(`  publicCost          : ${formatEther(drop.publicCost)} ETH`);
    console.log(`  protocolFee         : ${formatEther(fee)} ETH per NFT`);
    console.log(`  TOTAL public/NFT    : ${formatEther(drop.publicCost + fee)} ETH`);
    console.log(`  startTime (presale) : ${start > 0 ? new Date(start * 1000).toISOString() : '—'}`);
    console.log(`  presaleDuration     : ${drop.presaleDuration}s`);
    console.log(`  publicStartsAt      : ${new Date(presaleEnd * 1000).toISOString()}`);
    console.log(`  publicDuration      : ${drop.publicDuration}s (0=open-ended)`);
    console.log(`  publicEndsAt        : ${drop.publicDuration > 0n ? new Date(publicEnd * 1000).toISOString() : 'never'}`);
    console.log(`  presaleMerkleRoot   : ${drop.presaleMerkleRoot}`);

    if (now < start) console.log(`\n  >>> ${start - now}s until presale opens`);
    else if (now < presaleEnd) console.log(`\n  >>> PRESALE active. ${presaleEnd - now}s until PUBLIC OPENS (${new Date(presaleEnd * 1000).toISOString()})`);
    else if (drop.publicDuration === 0n || now < publicEnd) console.log(`\n  >>> PUBLIC MINT IS LIVE — go!`);
    else console.log(`\n  >>> ENDED ${now - publicEnd}s ago`);
  } catch (e) {
    console.log(`  error: ${e.message.slice(0, 160)}`);
  }
}
