import type {
  AdjudicationOutcome,
  Limits,
  Plan,
  Scenario,
  StepRecord,
  Violation,
  ViolationKind,
} from './types';

/**
 * 决胜比较容差：不同候选方案的力矩余量 / 总代价在此差值内视为并列。
 * 仅用于方案之间的优劣比较，不用于载荷 / 力矩的边界判定。
 */
export const EPS = 1e-9;

/**
 * 边界判定的相对容差系数：只允许抵消 IEEE-754 四则运算引入的舍入误差
 * （数次乘加约数个 ulp，相对误差 1e-16 量级），绝不吞没按录入十进制值
 * 真实存在的越界量——例如 4 × 0.2500000001 = 1.0000000004 超出上限 1
 * （越界约 4e-10），必须判定为超载。
 */
const ROUND_SLOP = 16 * Number.EPSILON;

/** 与参与比较的数值量级挂钩的舍入容差（绝对值）。 */
function roundSlop(a: number, b: number): number {
  return ROUND_SLOP * Math.max(1, Math.abs(a), Math.abs(b));
}

/** 已挂质量是否超过总载荷上限：闭区间判定，恰等于上限（扣除舍入误差）可行。 */
function exceedsLoad(massAfter: number, maxLoad: number): boolean {
  return massAfter > maxLoad + roundSlop(massAfter, maxLoad);
}

/** 挂后力矩越出力矩闭区间时触发的限制（DFS 剪枝与不可行诊断共用，保证口径一致）。 */
function torqueViolationKinds(torqueAfter: number, limits: Limits): ViolationKind[] {
  const kinds: ViolationKind[] = [];
  if (torqueAfter < limits.minTorque - roundSlop(torqueAfter, limits.minTorque)) kinds.push('torque-low');
  if (torqueAfter > limits.maxTorque + roundSlop(torqueAfter, limits.maxTorque)) kinds.push('torque-high');
  return kinds;
}

interface FlatOption {
  optionIndex: number;
  railId: string;
  railName: string;
  coordinate: number;
  cost: number;
}

interface FlatBlock {
  index: number;
  name: string;
  mass: number;
  options: FlatOption[];
}

function torqueMarginOf(torque: number, limits: Limits): number {
  return Math.min(torque - limits.minTorque, limits.maxTorque - torque);
}

/** 按 (块录入序号, 位置录入序号) 沿挂装次序逐位比较，保证稳定决胜。 */
function lexCompareSteps(a: StepRecord[], b: StepRecord[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].blockIndex !== b[i].blockIndex) return a[i].blockIndex - b[i].blockIndex;
    if (a[i].optionIndex !== b[i].optionIndex) return a[i].optionIndex - b[i].optionIndex;
  }
  return a.length - b.length;
}

/**
 * 裁决优先级（依次）：
 * 1. 力矩余量（所有前缀中的最小值）最大者优先；
 * 2. 总安装代价最小者优先；
 * 3. 按挂装顺序的 (块录入序号, 位置录入序号) 序列字典序最小者优先。
 */
function isBetter(a: Plan, b: Plan | null): boolean {
  if (b === null) return true;
  if (a.minTorqueMargin > b.minTorqueMargin + EPS) return true;
  if (a.minTorqueMargin < b.minTorqueMargin - EPS) return false;
  if (a.totalCost < b.totalCost - EPS) return true;
  if (a.totalCost > b.totalCost + EPS) return false;
  return lexCompareSteps(a.steps, b.steps) < 0;
}

/**
 * 裁决：联合确定每块配重恰用一次的挂入位置与完整挂装次序。
 *
 * 搜索按挂装顺序逐步进行，每一个前缀状态都同时校验总载荷与力矩闭区间，
 * 因此绝不出现“先定最终位置再事后排序”的情况；力矩余量沿前缀单调不增、
 * 总代价单调不减（代价非负），据此对当前最优解做分支限界。
 */
export function adjudicate(scenario: Scenario): AdjudicationOutcome {
  const railById = new Map(scenario.rails.map((r) => [r.id, r]));
  const blocks: FlatBlock[] = scenario.blocks.map((b, i) => ({
    index: i,
    name: b.name,
    mass: b.mass,
    options: b.options.map((o, j) => {
      const rail = railById.get(o.railId);
      if (!rail) throw new Error(`未知导轨位置: ${o.railId}`);
      return {
        optionIndex: j,
        railId: rail.id,
        railName: rail.name,
        coordinate: rail.coordinate,
        cost: o.cost,
      };
    }),
  }));
  const n = blocks.length;
  const limits = scenario.limits;

  const used = new Array<boolean>(n).fill(false);
  const steps: StepRecord[] = [];
  let best: Plan | null = null;
  /** 每个深度上按裁决优先级最优的可行前缀（用于无可行方案时的诊断）。 */
  const bestPartial: (Plan | null)[] = new Array(n + 1).fill(null);

  const snapshot = (totalCost: number, minTorqueMargin: number): Plan => ({
    steps: steps.map((s) => ({ ...s })),
    totalCost,
    minTorqueMargin,
    finalMass: steps.length > 0 ? steps[steps.length - 1].cumulativeMass : 0,
    finalTorque: steps.length > 0 ? steps[steps.length - 1].cumulativeTorque : 0,
  });

  const dfs = (depth: number, mass: number, torque: number, cost: number, minMargin: number): void => {
    const current = snapshot(cost, minMargin);
    if (isBetter(current, bestPartial[depth])) bestPartial[depth] = current;
    if (depth === n) {
      if (isBetter(current, best)) best = current;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const block = blocks[i];
      for (const opt of block.options) {
        const massAfter = mass + block.mass;
        if (exceedsLoad(massAfter, limits.maxLoad)) continue;
        const torqueAfter = torque + block.mass * opt.coordinate;
        if (torqueViolationKinds(torqueAfter, limits).length > 0) continue;
        const margin = torqueMarginOf(torqueAfter, limits);
        const nextMinMargin = Math.min(minMargin, margin);
        const nextCost = cost + opt.cost;
        if (best) {
          // 力矩余量已严格劣于最优解，剪枝。
          if (nextMinMargin < best.minTorqueMargin - EPS) continue;
          // 余量无法严格更优且代价已严格更差，剪枝。
          if (nextMinMargin < best.minTorqueMargin + EPS && nextCost > best.totalCost + EPS) continue;
        }
        used[i] = true;
        steps.push({
          blockIndex: i,
          blockName: block.name,
          optionIndex: opt.optionIndex,
          railId: opt.railId,
          railName: opt.railName,
          coordinate: opt.coordinate,
          mass: block.mass,
          cost: opt.cost,
          cumulativeMass: massAfter,
          cumulativeTorque: torqueAfter,
          loadMargin: limits.maxLoad - massAfter,
          torqueMargin: margin,
        });
        dfs(depth + 1, massAfter, torqueAfter, nextCost, nextMinMargin);
        steps.pop();
        used[i] = false;
      }
    }
  };

  dfs(0, 0, 0, 0, Number.POSITIVE_INFINITY);

  if (best) return { feasible: true, plan: best };

  // 无可行方案：定位最深的可行已选前缀（其下一步即最早无法继续挂装的位置）。
  let depth = n - 1;
  while (depth >= 0 && bestPartial[depth] === null) depth--;
  const witness = depth >= 0 ? bestPartial[depth] : null;
  const witnessSteps = witness ? witness.steps : [];
  const usedBlocks = new Set(witnessSteps.map((s) => s.blockIndex));
  const baseMass = witness ? witness.finalMass : 0;
  const baseTorque = witness ? witness.finalTorque : 0;

  const violations: Violation[] = [];
  for (const block of blocks) {
    if (usedBlocks.has(block.index)) continue;
    for (const opt of block.options) {
      const massAfter = baseMass + block.mass;
      const torqueAfter = baseTorque + block.mass * opt.coordinate;
      const kinds: ViolationKind[] = [];
      if (exceedsLoad(massAfter, limits.maxLoad)) kinds.push('load');
      kinds.push(...torqueViolationKinds(torqueAfter, limits));
      if (kinds.length > 0) {
        violations.push({
          blockIndex: block.index,
          blockName: block.name,
          optionIndex: opt.optionIndex,
          railId: opt.railId,
          railName: opt.railName,
          massAfter,
          torqueAfter,
          kinds,
        });
      }
    }
  }
  return { feasible: false, report: { witnessPrefix: witnessSteps, violations } };
}
