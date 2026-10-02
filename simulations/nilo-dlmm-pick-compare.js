// nilo-dlmm-pick-compare.js — same scenario on two forks: df091b8 as is, and with
// the price-based dlmm-pick. Reports what A receives and the execution cost of
// A's router call (runtime, read_count) in each, for the runtime delta the bounty asks for.
import fs from 'node:fs';
import { uintCV, noneCV } from '@stacks/transactions';
import { ROUTER, SBTC, WSTX, deployAll, initMarket, evRaw, tx, fund, wallet, manualArgs, principal, mk, source, H } from './_router-v5-3-harness.js';
const DLMM_ROUTER = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2';
const POOL1 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-1-bps-15';
const N = BigInt(process.env.NILO_STX ?? 1000) * 1_000_000n;
const orig = source('swap-router-sbtc-stx-jing-v5-3');
const start = orig.indexOf(';; The DLMM pool for a leg:');
const end = orig.indexOf('(define-private (dlmm-depth');
if (start < 0 || end < 0) throw new Error('dlmm-pick block not found');
const fixed = orig.slice(0, start) + fs.readFileSync(new URL('./nilo-dlmm-pick-fix.clar.txt', import.meta.url), 'utf8') + '\n' + orig.slice(end);
const cost = (r) => { const c = r.receipt?.execution_cost ?? r.receipt?.cost ?? {}; return { runtime: c.runtime, read_count: c.read_count, read_length: c.read_length }; };
const out = {};
for (const [label, src] of [['df091b8', orig], ['price-pick', fixed]]) {
  await deployAll([], { 'swap-router-sbtc-stx-jing-v5-3': src });
  await initMarket();
  const pick = await evRaw(ROUTER, '(list (dlmm-pick false) (dlmm-pick true))');
  const A = mk(7), B = mk(8);
  await fund('y', A, N + 10_000_000n); await fund('y', B, N + 10_000_000n);
  const a0 = await wallet(A), b0 = await wallet(B);
  const r = await tx(`[${label}] A sells via router DLMM leg`, A, ROUTER, 'swap-stx-for-sbtc', manualArgs({ amount: N, a: [N, 0n, 0n] }), (v) => String(v).startsWith('(ok'));
  await tx(`[${label}] B sells directly on v-1`, B, DLMM_ROUTER, 'swap-x-for-y-simple-range-multi', [principal(POOL1), principal(WSTX), principal(SBTC), uintCV(N), uintCV(0), uintCV(230), noneCV()], (v) => String(v).startsWith('(ok'));
  const gotA = (await wallet(A)).x - a0.x, gotB = (await wallet(B)).x - b0.x;
  out[label] = { sim: `https://stxer.xyz/simulations/mainnet/${H.sid}`, pick, gotA: String(gotA), gotB: String(gotB), cost: cost(r), receiptKeys: Object.keys(r.receipt ?? {}) };
  console.log(label, JSON.stringify(out[label]));
}
fs.writeFileSync(new URL('./nilo-dlmm-pick-compare.json', import.meta.url), JSON.stringify(out, null, 1));
