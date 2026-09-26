import { describe, expect, it } from 'vitest';
import { adjudicate, EPS } from './adjudicate';
import type { Scenario } from './types';

const rails = (...defs: [string, number][]): Scenario['rails'] =>
  defs.map(([name, coordinate], i) => ({ id: `rail-${i}`, name, coordinate }));

const block = (
  name: string,
  mass: number,
  options: [number, number][], // [railIndex, cost]
): Scenario['blocks'][number] => ({
  id: `blk-${name}`,
  name,
  mass,
  options: options.map(([railIndex, cost]) => ({ railId: `rail-${railIndex}`, cost })),
});

const limits = (maxLoad: number, minTorque: number, maxTorque: number): Scenario['limits'] => ({
  maxLoad,
  minTorque,
  maxTorque,
});

describe('adjudicate · 可行方案与决胜规则', () => {
  it('基本求解：前缀均满足约束，代价/序号稳定决胜', () => {
    // 两块等质量配重，左右对称；四套可行方案余量与代价全同，按录入序号取字典序最小。
    const outcome = adjudicate({
      rails: rails(['L', -1], ['R', 1]),
      blocks: [block('b1', 4, [[0, 1], [1, 1]]), block('b2', 4, [[0, 1], [1, 1]])],
      limits: limits(100, -5, 5),
    });
    expect(outcome.feasible).toBe(true);
    if (!outcome.feasible) return;
    expect(outcome.plan.steps.map((s) => [s.blockIndex, s.railName])).toEqual([
      [0, 'L'],
      [1, 'R'],
    ]);
    expect(outcome.plan.totalCost).toBeCloseTo(2);
    expect(outcome.plan.minTorqueMargin).toBeCloseTo(1);
    // 每个前缀状态同时满足载荷与力矩限制
    for (const s of outcome.plan.steps) {
      expect(s.cumulativeMass).toBeLessThanOrEqual(100 + EPS);
      expect(s.cumulativeTorque).toBeGreaterThanOrEqual(-5 - EPS);
      expect(s.cumulativeTorque).toBeLessThanOrEqual(5 + EPS);
    }
  });

  it('力矩余量最大优先于总代价最小', () => {
    // 便宜方案（代价 2）余量仅 1；居中方案（代价 20）余量 5，必须选后者。
    const outcome = adjudicate({
      rails: rails(['L', -2], ['M', 0], ['R', 2]),
      blocks: [block('b1', 2, [[1, 10], [2, 1]]), block('b2', 2, [[0, 1], [1, 10]])],
      limits: limits(100, -5, 5),
    });
    expect(outcome.feasible).toBe(true);
    if (!outcome.feasible) return;
    expect(outcome.plan.minTorqueMargin).toBeCloseTo(5);
    expect(outcome.plan.totalCost).toBeCloseTo(20);
    expect(outcome.plan.steps.map((s) => s.railName)).toEqual(['M', 'M']);
  });

  it('余量并列时取总代价最小，再按挂装顺序与位置录入序号决胜', () => {
    // 两条零力臂导轨 M1/M2：余量 5 的方案中，b1@M2 + b2@M1 代价 8 最小。
    const outcome = adjudicate({
      rails: rails(['L', -2], ['M1', 0], ['M2', 0], ['R', 2]),
      blocks: [
        block('b1', 2, [[1, 8], [2, 3], [3, 1]]),
        block('b2', 2, [[1, 5], [2, 6], [0, 1]]),
      ],
      limits: limits(100, -5, 5),
    });
    expect(outcome.feasible).toBe(true);
    if (!outcome.feasible) return;
    expect(outcome.plan.minTorqueMargin).toBeCloseTo(5);
    expect(outcome.plan.totalCost).toBeCloseTo(8);
    expect(outcome.plan.steps.map((s) => [s.blockIndex, s.railName])).toEqual([
      [0, 'M2'],
      [1, 'M1'],
    ]);
  });

  it('联合确定位置与次序：不得先选最终位置再事后排序', () => {
    // b4 挂 L（-6）时最终合力矩可为 0，但任何挂装次序都会在中途越界；
    // 只有 b4 挂 H（-3）且 b3 挂 L 并交错挂装才全程安全，且代价更高（9）。
    const outcome = adjudicate({
      rails: rails(['L', -1], ['H', -0.5], ['R', 1]),
      blocks: [
        block('b1', 2, [[2, 1]]),
        block('b2', 2, [[2, 1]]),
        block('b3', 2, [[2, 1], [0, 1]]),
        block('b4', 6, [[0, 1], [1, 9]]),
      ],
      limits: limits(100, -3, 3),
    });
    expect(outcome.feasible).toBe(true);
    if (!outcome.feasible) return;
    expect(outcome.plan.steps.map((s) => [s.blockIndex, s.railName])).toEqual([
      [0, 'R'],
      [2, 'L'],
      [1, 'R'],
      [3, 'H'],
    ]);
    expect(outcome.plan.totalCost).toBeCloseTo(12);
    expect(outcome.plan.minTorqueMargin).toBeCloseTo(1);
    for (const s of outcome.plan.steps) {
      expect(s.cumulativeTorque).toBeGreaterThanOrEqual(-3 - EPS);
      expect(s.cumulativeTorque).toBeLessThanOrEqual(3 + EPS);
    }
  });

  it('多块场景：每块恰用一次且结果确定（可重复）', () => {
    const scenario: Scenario = {
      rails: rails(['L2', -2], ['L1', -1], ['C', 0], ['R1', 1], ['R2', 2]),
      blocks: [
        block('b1', 20, [[1, 2], [3, 2]]),
        block('b2', 15, [[0, 3], [4, 3], [2, 5]]),
        block('b3', 25, [[1, 4], [4, 4]]),
        block('b4', 10, [[2, 1], [3, 2]]),
        block('b5', 30, [[0, 2], [3, 3], [4, 4]]),
      ],
      limits: limits(150, -100, 100),
    };
    const first = adjudicate(scenario);
    const second = adjudicate(scenario);
    expect(first).toEqual(second);
    expect(first.feasible).toBe(true);
    if (!first.feasible) return;
    expect(first.plan.steps).toHaveLength(5);
    expect(new Set(first.plan.steps.map((s) => s.blockIndex)).size).toBe(5);
    for (const s of first.plan.steps) {
      expect(s.cumulativeMass).toBeLessThanOrEqual(150 + EPS);
      expect(Math.abs(s.cumulativeTorque)).toBeLessThanOrEqual(100 + EPS);
      expect(s.loadMargin).toBeCloseTo(150 - s.cumulativeMass);
    }
  });
});

describe('adjudicate · 无可行方案的诊断', () => {
  it('第一步即不可挂：已选前缀为空，逐一列出触发的力矩限制', () => {
    const outcome = adjudicate({
      rails: rails(['L', -1], ['R', 1]),
      blocks: [block('b1', 3, [[0, 1], [1, 1]]), block('b2', 3, [[0, 1], [1, 1]])],
      limits: limits(100, -2, 2),
    });
    expect(outcome.feasible).toBe(false);
    if (outcome.feasible) return;
    expect(outcome.report.witnessPrefix).toHaveLength(0);
    expect(outcome.report.violations).toHaveLength(4);
    const kinds = new Map(outcome.report.violations.map((v) => [`${v.blockIndex}:${v.railName}`, v.kinds]));
    expect(kinds.get('0:L')).toEqual(['torque-low']);
    expect(kinds.get('0:R')).toEqual(['torque-high']);
    expect(kinds.get('1:L')).toEqual(['torque-low']);
    expect(kinds.get('1:R')).toEqual(['torque-high']);
  });

  it('最深前缀止步于载荷限制', () => {
    const outcome = adjudicate({
      rails: rails(['M', 0]),
      blocks: [block('b1', 3, [[0, 1]]), block('b2', 3, [[0, 1]]), block('b3', 3, [[0, 1]])],
      limits: limits(5, -10, 10),
    });
    expect(outcome.feasible).toBe(false);
    if (outcome.feasible) return;
    expect(outcome.report.witnessPrefix).toHaveLength(1);
    expect(outcome.report.witnessPrefix[0].blockIndex).toBe(0);
    expect(outcome.report.violations).toHaveLength(2);
    for (const v of outcome.report.violations) {
      expect(v.kinds).toEqual(['load']);
      expect(v.massAfter).toBeCloseTo(6);
    }
  });

  it('最深前缀按裁决优先级选取，并列选择同时触发载荷与力矩限制', () => {
    // 深度 1 的三个可行前缀余量分别为 2/1/0，须选余量最大的 b1。
    const outcome = adjudicate({
      rails: rails(['R', 1]),
      blocks: [block('b1', 3, [[0, 1]]), block('b2', 4, [[0, 1]]), block('b3', 5, [[0, 1]])],
      limits: limits(6, -5, 5),
    });
    expect(outcome.feasible).toBe(false);
    if (outcome.feasible) return;
    expect(outcome.report.witnessPrefix).toHaveLength(1);
    expect(outcome.report.witnessPrefix[0].blockIndex).toBe(0);
    expect(outcome.report.witnessPrefix[0].cumulativeTorque).toBeCloseTo(3);
    expect(outcome.report.violations).toHaveLength(2);
    for (const v of outcome.report.violations) {
      expect(v.kinds).toEqual(['load', 'torque-high']);
    }
  });
});
