/**
 * 一次性冒烟脚本（verify 服务）：
 *  1. 对裁决业务模块跑确定性用例（可行 / 不可行）；
 *  2. 探测已启动页面的健康端点 /healthz；
 *  3. 探测首页可访问。
 * 全部通过以退出码 0 结束，否则退出码 1。
 */
import { adjudicate } from '../src/solver/adjudicate';
import type { Scenario } from '../src/solver/types';

const base = `http://${process.env.WEB_HOST ?? 'web'}:${process.env.WEB_PORT ?? '8080'}`;

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// ---------- 1. 裁决业务模块冒烟 ----------

// 可行场景：余量 5 的方案中 b1@M2 + b2@M1 总代价 8 最小，次序按录入序号决胜。
const feasibleScenario: Scenario = {
  rails: [
    { id: 'L', name: 'L', coordinate: -2 },
    { id: 'M1', name: 'M1', coordinate: 0 },
    { id: 'M2', name: 'M2', coordinate: 0 },
    { id: 'R', name: 'R', coordinate: 2 },
  ],
  blocks: [
    { id: 'b1', name: 'b1', mass: 2, options: [{ railId: 'M1', cost: 8 }, { railId: 'M2', cost: 3 }, { railId: 'R', cost: 1 }] },
    { id: 'b2', name: 'b2', mass: 2, options: [{ railId: 'M1', cost: 5 }, { railId: 'M2', cost: 6 }, { railId: 'L', cost: 1 }] },
  ],
  limits: { maxLoad: 100, minTorque: -5, maxTorque: 5 },
};

const r1 = adjudicate(feasibleScenario);
check(r1.feasible, '裁决模块：可行场景应判定为可行');
if (r1.feasible) {
  check(r1.plan.steps.length === 2, '裁决模块：方案应覆盖全部配重（每块恰用一次）');
  check(
    r1.plan.steps.every((s) => Math.abs(s.cumulativeTorque) <= 5 + 1e-9 && s.cumulativeMass <= 100 + 1e-9),
    '裁决模块：每个前缀状态均满足载荷与力矩限制',
  );
  check(Math.abs(r1.plan.totalCost - 8) < 1e-9, `裁决模块：总安装代价应为 8（实际 ${r1.plan.totalCost}）`);
  check(Math.abs(r1.plan.minTorqueMargin - 5) < 1e-9, `裁决模块：力矩余量应为 5（实际 ${r1.plan.minTorqueMargin}）`);
  check(
    r1.plan.steps[0].railId === 'M2' && r1.plan.steps[1].railId === 'M1',
    '裁决模块：挂装位置与次序应符合决胜规则（b1@M2 → b2@M1）',
  );
}

// 不可行场景：深度 1 即止步，最深前缀为 b1@R（余量最大），剩余选择同时触发载荷与力矩限制。
const infeasibleScenario: Scenario = {
  rails: [{ id: 'R', name: 'R', coordinate: 1 }],
  blocks: [
    { id: 'b1', name: 'b1', mass: 3, options: [{ railId: 'R', cost: 1 }] },
    { id: 'b2', name: 'b2', mass: 4, options: [{ railId: 'R', cost: 1 }] },
    { id: 'b3', name: 'b3', mass: 5, options: [{ railId: 'R', cost: 1 }] },
  ],
  limits: { maxLoad: 6, minTorque: -5, maxTorque: 5 },
};

const r2 = adjudicate(infeasibleScenario);
check(!r2.feasible, '裁决模块：不可行场景应判定为不可行');
if (!r2.feasible) {
  check(r2.report.witnessPrefix.length === 1, '裁决模块：应给出最深可行已选前缀（长度 1）');
  check(
    r2.report.witnessPrefix[0]?.blockIndex === 0,
    '裁决模块：已选前缀应取余量最大的 b1',
  );
  check(
    r2.report.violations.length === 2 &&
      r2.report.violations.every((v) => v.kinds.includes('load') && v.kinds.includes('torque-high')),
    '裁决模块：应列出剩余选择触发的载荷/力矩限制',
  );
}

// ---------- 2. 已启动页面健康端点冒烟 ----------

const deadline = Date.now() + 60_000;
let health: { status?: string } | null = null;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${base}/healthz`);
    if (res.ok) {
      health = (await res.json()) as { status?: string };
      break;
    }
  } catch {
    // 页面尚未就绪，继续等待
  }
  await new Promise((r) => setTimeout(r, 1000));
}
check(health !== null && health.status === 'ok', `健康端点 ${base}/healthz 应返回 status=ok`);

// ---------- 3. 首页可访问 ----------

try {
  const res = await fetch(`${base}/`);
  const html = await res.text();
  check(res.ok && html.includes('id="root"'), `首页 ${base}/ 应返回包含挂载点的 HTML`);
} catch {
  check(false, `首页 ${base}/ 请求失败`);
}

if (failures > 0) {
  console.error(`\nsmoke: ${failures} 项未通过`);
  process.exit(1);
}
console.log('\nsmoke: 全部通过');
