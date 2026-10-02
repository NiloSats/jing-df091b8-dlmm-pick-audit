// nilo-dlmm-pick.js — Nilo (an AI agent built with Claude), E-15 finding.
// Stxer mainnet fork, router swap-router-sbtc-stx-jing-v5-3 exactly as in df091b8.
// Question: does `dlmm-pick` send a STX->sBTC DLMM leg to the pool with the best price?
// It ranks the three Bitflow STX/sBTC pools by raw balance of the asset bought, so
// when a pool is out of range (one-sided, all sBTC) it can be the "deepest" while
// quoting a much worse bin. This run measures it on live pool state:
//   1. the pick, read inside the router (private fn via Eval)
//   2. each pool's active-bin price (dlmm-core get-bin-price) and balances
//   3. A sells N STX through the router's DLMM leg; B sells the same N STX directly
//      on pool v-1 through Bitflow's own router. Same fork state, independent pools.
import { uintCV, noneCV } from '@stacks/transactions';
import {
  DEP, ROUTER, SBTC, WSTX, deployAll, initMarket, evRaw, tx, fund, wallet, manualArgs, principal, mk, check, done, H,
} from './_router-v5-3-harness.js';

const DLMM_ROUTER = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2';
const POOL = (n) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-${n}-bps-15`;
const CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const N = BigInt(process.env.NILO_STX ?? 1000) * 1_000_000n; // uSTX sold by each user

await deployAll();
await initMarket();

const pick = await evRaw(ROUTER, '(list (dlmm-pick false) (dlmm-pick true))');
console.log('dlmm-pick (sell STX, sell sBTC):', pick);
for (const n of [1, 2, 3]) {
  const st = await evRaw(ROUTER, `(let ((p (unwrap-panic (contract-call? '${POOL(n)} get-pool))))
    { active-bin: (get active-bin-id p),
      price: (unwrap-panic (contract-call? '${CORE} get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p))),
      stx: (stx-get-balance '${POOL(n)}),
      sbtc: (unwrap-panic (contract-call? '${SBTC} get-balance '${POOL(n)})) })`);
  console.log(`pool v-${n}:`, st);
}

const A = mk(7), B = mk(8);
await fund('y', A, N + 10_000_000n);
await fund('y', B, N + 10_000_000n);
const a0 = await wallet(A), b0 = await wallet(B);

// A: the router, DLMM leg only, no Jing book, no fallback, no minimum
await tx(`A sells ${N} uSTX via router DLMM leg`, A, ROUTER, 'swap-stx-for-sbtc',
  manualArgs({ amount: N, a: [N, 0n, 0n] }), (r) => String(r).startsWith('(ok'));
// B: the same amount straight into pool v-1 through Bitflow's router
await tx(`B sells ${N} uSTX directly on pool v-1`, B, DLMM_ROUTER, 'swap-x-for-y-simple-range-multi',
  [principal(POOL(1)), principal(WSTX), principal(SBTC), uintCV(N), uintCV(0), uintCV(230), noneCV()],
  (r) => String(r).startsWith('(ok'));

const a1 = await wallet(A), b1 = await wallet(B);
const gotA = a1.x - a0.x, gotB = b1.x - b0.x;
console.log(`A (router pick) received ${gotA} sats; B (pool v-1) received ${gotB} sats`);
console.log(`shortfall: ${gotB - gotA} sats = ${(Number(gotB - gotA) * 100 / Number(gotB)).toFixed(2)}% of what v-1 pays`);
check('router leg receives less than the same sale on v-1', gotA < gotB ? 'yes' : `no (${gotA} vs ${gotB})`, 'yes');
done();
