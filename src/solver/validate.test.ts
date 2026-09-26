import { describe, expect, it } from 'vitest';
import { validateScenario } from './validate';
import type { Scenario } from './types';

function validScenario(): Scenario {
  return {
    rails: [
      { id: 'r1', name: '左一', coordinate: -1 },
      { id: 'r2', name: '中', coordinate: 0 },
      { id: 'r3', name: '右一', coordinate: 1 },
    ],
    blocks: [
      { id: 'b1', name: '甲', mass: 10, options: [{ railId: 'r1', cost: 1 }, { railId: 'r3', cost: 1 }] },
      { id: 'b2', name: '乙', mass: 10, options: [{ railId: 'r1', cost: 1 }, { railId: 'r2', cost: 1 }] },
      { id: 'b3', name: '丙', mass: 10, options: [{ railId: 'r2', cost: 1 }, { railId: 'r3', cost: 1 }] },
      { id: 'b4', name: '丁', mass: 10, options: [{ railId: 'r1', cost: 1 }, { railId: 'r2', cost: 1 }, { railId: 'r3', cost: 1 }] },
    ],
    limits: { maxLoad: 100, minTorque: -10, maxTorque: 10 },
  };
}

describe('validateScenario', () => {
  it('合法录入无错误', () => {
    expect(validateScenario(validScenario())).toEqual([]);
  });

  it('配重数量须为 4 至 7 块', () => {
    const few = validScenario();
    few.blocks = few.blocks.slice(0, 3);
    expect(validateScenario(few).some((e) => e.includes('4 至 7'))).toBe(true);

    const many = validScenario();
    for (let i = 5; i <= 8; i++) {
      many.blocks.push({ id: `b${i}`, name: `配${i}`, mass: 5, options: [{ railId: 'r1', cost: 0 }, { railId: 'r2', cost: 0 }] });
    }
    expect(validateScenario(many).some((e) => e.includes('4 至 7'))).toBe(true);
  });

  it('每块可挂位置须为 2 至 3 个', () => {
    const s = validScenario();
    s.blocks[0].options = [{ railId: 'r1', cost: 1 }];
    expect(validateScenario(s).some((e) => e.includes('2 至 3'))).toBe(true);
  });

  it('质量须为正数、代价须为非负数', () => {
    const s = validScenario();
    s.blocks[0].mass = 0;
    s.blocks[1].options[0].cost = -1;
    const errors = validateScenario(s);
    expect(errors.some((e) => e.includes('质量须为正数'))).toBe(true);
    expect(errors.some((e) => e.includes('安装代价须为非负数'))).toBe(true);
  });

  it('力矩区间下端不得大于上端，载荷上限须非负', () => {
    const s = validScenario();
    s.limits.minTorque = 5;
    s.limits.maxTorque = -5;
    s.limits.maxLoad = -1;
    const errors = validateScenario(s);
    expect(errors.some((e) => e.includes('下端不得大于上端'))).toBe(true);
    expect(errors.some((e) => e.includes('总载荷上限须为非负数'))).toBe(true);
  });

  it('位置不得重复选择同一导轨，且必须引用存在的导轨', () => {
    const s = validScenario();
    s.blocks[0].options = [{ railId: 'r1', cost: 1 }, { railId: 'r1', cost: 2 }];
    s.blocks[1].options = [{ railId: 'ghost', cost: 1 }, { railId: 'r2', cost: 1 }];
    const errors = validateScenario(s);
    expect(errors.some((e) => e.includes('重复选择'))).toBe(true);
    expect(errors.some((e) => e.includes('不存在的导轨'))).toBe(true);
  });

  it('导轨名称不得为空或重复', () => {
    const s = validScenario();
    s.rails[0].name = '';
    s.rails[1].name = '右一';
    const errors = validateScenario(s);
    expect(errors.some((e) => e.includes('名称不能为空'))).toBe(true);
    expect(errors.some((e) => e.includes('名称重复'))).toBe(true);
  });
});
