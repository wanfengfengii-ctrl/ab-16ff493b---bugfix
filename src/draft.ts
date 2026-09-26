import type { Scenario } from './solver/types';
import { validateScenario } from './solver/validate';

export interface DraftRail {
  id: string;
  name: string;
  coordinate: string;
}

export interface DraftOption {
  railId: string;
  cost: string;
}

export interface DraftBlock {
  id: string;
  name: string;
  mass: string;
  /** 已勾选的可挂位置，数组顺序即“位置录入序号”。 */
  options: DraftOption[];
}

export interface Draft {
  rails: DraftRail[];
  blocks: DraftBlock[];
  maxLoad: string;
  minTorque: string;
  maxTorque: string;
}

let seq = 0;
export const nextId = (): string => `id-${++seq}`;

export function defaultDraft(): Draft {
  const rails: DraftRail[] = [
    { id: nextId(), name: '左二', coordinate: '-2' },
    { id: nextId(), name: '左一', coordinate: '-1' },
    { id: nextId(), name: '中', coordinate: '0' },
    { id: nextId(), name: '右一', coordinate: '1' },
    { id: nextId(), name: '右二', coordinate: '2' },
  ];
  const [l2, l1, c, r1, r2] = rails;
  return {
    rails,
    blocks: [
      { id: nextId(), name: '配重甲', mass: '40', options: [{ railId: l1.id, cost: '6' }, { railId: r1.id, cost: '6' }] },
      { id: nextId(), name: '配重乙', mass: '30', options: [{ railId: l2.id, cost: '8' }, { railId: r2.id, cost: '8' }, { railId: c.id, cost: '12' }] },
      { id: nextId(), name: '配重丙', mass: '25', options: [{ railId: l1.id, cost: '5' }, { railId: r2.id, cost: '7' }] },
      { id: nextId(), name: '配重丁', mass: '35', options: [{ railId: l2.id, cost: '9' }, { railId: r1.id, cost: '9' }, { railId: c.id, cost: '11' }] },
    ],
    maxLoad: '200',
    minTorque: '-30',
    maxTorque: '30',
  };
}

export type ParseResult = { scenario: Scenario } | { errors: string[] };

/** 把草稿解析为求解输入；数值非法或违反录入约束时返回全部错误。 */
export function parseDraft(d: Draft): ParseResult {
  const errors: string[] = [];
  const num = (raw: string, label: string): number => {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) {
      errors.push(`${label}须为数值`);
      return NaN;
    }
    return v;
  };

  const scenario: Scenario = {
    rails: d.rails.map((r) => ({
      id: r.id,
      name: r.name,
      coordinate: num(r.coordinate, `导轨「${r.name}」的力臂坐标`),
    })),
    blocks: d.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      mass: num(b.mass, `配重「${b.name}」的质量`),
      options: b.options.map((o) => ({
        railId: o.railId,
        cost: num(o.cost, `配重「${b.name}」的安装代价`),
      })),
    })),
    limits: {
      maxLoad: num(d.maxLoad, '卷扬轴总载荷上限'),
      minTorque: num(d.minTorque, '力矩区间下端'),
      maxTorque: num(d.maxTorque, '力矩区间上端'),
    },
  };
  errors.push(...validateScenario(scenario));
  return errors.length > 0 ? { errors } : { scenario };
}
