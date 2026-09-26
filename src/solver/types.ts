/** 导轨位置：配重可挂入的物理位置，coordinate 为相对卷扬轴中心的力臂（左负右正）。 */
export interface RailPosition {
  id: string;
  name: string;
  coordinate: number;
}

/** 某块配重的一个可挂入选项：挂到指定导轨位置的安装代价。 */
export interface BlockOptionInput {
  railId: string;
  cost: number;
}

/** 一块幕布配重。 */
export interface BlockInput {
  id: string;
  name: string;
  mass: number;
  /** 可挂入的 2~3 个导轨位置，数组顺序即“位置录入序号”。 */
  options: BlockOptionInput[];
}

/** 卷扬轴限制：总载荷上限与左右力矩闭区间。 */
export interface Limits {
  maxLoad: number;
  minTorque: number;
  maxTorque: number;
}

export interface Scenario {
  rails: RailPosition[];
  blocks: BlockInput[];
  limits: Limits;
}

/** 挂装序列中的一步（即一个前缀状态的增量记录）。 */
export interface StepRecord {
  blockIndex: number;
  blockName: string;
  optionIndex: number;
  railId: string;
  railName: string;
  coordinate: number;
  /** 本步挂上的配重质量。 */
  mass: number;
  /** 本步采用位置的安装代价。 */
  cost: number;
  /** 本步完成后的已挂质量。 */
  cumulativeMass: number;
  /** 本步完成后的合力矩。 */
  cumulativeTorque: number;
  /** 载荷余量 = 总载荷上限 - 已挂质量。 */
  loadMargin: number;
  /** 力矩余量 = min(力矩 - 下限, 上限 - 力矩)，即力矩到闭区间边界的最短距离。 */
  torqueMargin: number;
}

/** 一套完整方案：每块配重恰用一次的位置 + 完整挂装次序。 */
export interface Plan {
  steps: StepRecord[];
  totalCost: number;
  /** 方案的力矩余量 = 所有前缀状态力矩余量的最小值（越大越安全）。 */
  minTorqueMargin: number;
  finalMass: number;
  finalTorque: number;
}

export type ViolationKind = 'load' | 'torque-low' | 'torque-high';

/** 从最深可行前缀出发，某个剩余 (配重, 位置) 选择会触发的限制。 */
export interface Violation {
  blockIndex: number;
  blockName: string;
  optionIndex: number;
  railId: string;
  railName: string;
  massAfter: number;
  torqueAfter: number;
  kinds: ViolationKind[];
}

/** 无可行方案时的诊断报告。 */
export interface InfeasibleReport {
  /**
   * 最深的可行已选前缀（多套并列时按裁决优先级取最优者）。
   * 其长度 + 1 即“最早无法继续挂装”的步号。
   */
  witnessPrefix: StepRecord[];
  /** 从该前缀出发，所有剩余 (配重, 位置) 选择各自触发的载荷/力矩限制。 */
  violations: Violation[];
}

export type AdjudicationOutcome =
  | { feasible: true; plan: Plan }
  | { feasible: false; report: InfeasibleReport };
