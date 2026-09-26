import { useState } from 'react';
import type { AdjudicationOutcome, Scenario, StepRecord, ViolationKind } from '../solver/types';
import { fmt } from '../format';

const KIND_LABEL: Record<ViolationKind, string> = {
  load: '总载荷超限',
  'torque-low': '力矩低于区间下端',
  'torque-high': '力矩高于区间上端',
};

interface Props {
  scenario: Scenario;
  outcome: AdjudicationOutcome;
}

/** 某一步中该配重未采用的位置（含其安装代价）。 */
function unusedOptions(scenario: Scenario, step: StepRecord) {
  const block = scenario.blocks[step.blockIndex];
  return block.options
    .map((o, j) => ({ o, j }))
    .filter(({ j }) => j !== step.optionIndex)
    .map(({ o, j }) => {
      const rail = scenario.rails.find((r) => r.id === o.railId);
      return { key: `${step.blockIndex}-${j}`, text: `${rail?.name ?? o.railId}（代价 ${fmt(o.cost)}）` };
    });
}

function StepTable({ scenario, steps, active }: { scenario: Scenario; steps: StepRecord[]; active?: number }) {
  return (
    <table className="steps">
      <thead>
        <tr>
          <th>步</th>
          <th>配重</th>
          <th>采用位置</th>
          <th>未采用位置</th>
          <th>已挂质量</th>
          <th>载荷余量</th>
          <th>力矩</th>
          <th>力矩余量</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((s, i) => (
          <tr key={i} className={active === i ? 'active' : undefined}>
            <td>{i + 1}</td>
            <td>{s.blockName}</td>
            <td>
              {s.railName}（力臂 {fmt(s.coordinate)}，代价 {fmt(s.cost)}）
            </td>
            <td>
              {unusedOptions(scenario, s).map((u) => (
                <span key={u.key} className="tag dim">
                  {u.text}
                </span>
              ))}
            </td>
            <td>{fmt(s.cumulativeMass)}</td>
            <td>{fmt(s.loadMargin)}</td>
            <td>{fmt(s.cumulativeTorque)}</td>
            <td>{fmt(s.torqueMargin)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeasibleView({ scenario, outcome }: { scenario: Scenario; outcome: Extract<AdjudicationOutcome, { feasible: true }> }) {
  const { plan } = outcome;
  const [idx, setIdx] = useState(0);
  const step = plan.steps[idx];
  const block = scenario.blocks[step.blockIndex];
  return (
    <section className="result ok">
      <h2>✓ 裁决通过：存在安全挂装顺序（共 {plan.steps.length} 步）</h2>
      <div className="summary">
        <div>
          <span className="k">总安装代价</span>
          <span className="v">{fmt(plan.totalCost)}</span>
        </div>
        <div>
          <span className="k">最小力矩余量</span>
          <span className="v">{fmt(plan.minTorqueMargin)}</span>
        </div>
        <div>
          <span className="k">最终已挂质量</span>
          <span className="v">
            {fmt(plan.finalMass)}（余量 {fmt(scenario.limits.maxLoad - plan.finalMass)}）
          </span>
        </div>
        <div>
          <span className="k">最终力矩</span>
          <span className="v">
            {fmt(plan.finalTorque)} ∈ [{fmt(scenario.limits.minTorque)}, {fmt(scenario.limits.maxTorque)}]
          </span>
        </div>
      </div>

      <div className="stepper">
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          ◀ 上一步
        </button>
        <strong>
          第 {idx + 1} / {plan.steps.length} 步
        </strong>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(plan.steps.length - 1, i + 1))}
          disabled={idx === plan.steps.length - 1}
        >
          下一步 ▶
        </button>
      </div>

      <div className="card">
        <h3>
          第 {idx + 1} 步：挂「{step.blockName}」（质量 {fmt(step.mass)}）
        </h3>
        <ul>
          <li>
            采用位置：<strong>{step.railName}</strong>（力臂 {fmt(step.coordinate)}，安装代价 {fmt(step.cost)}）
          </li>
          <li>
            未采用位置：
            {unusedOptions(scenario, step).map((u) => (
              <span key={u.key} className="tag dim">
                {u.text}
              </span>
            ))}
            {block.options.length <= 1 && '（无）'}
          </li>
          <li>
            本步后已挂质量 <strong>{fmt(step.cumulativeMass)}</strong>（载荷余量 {fmt(step.loadMargin)}），合力矩{' '}
            <strong>{fmt(step.cumulativeTorque)}</strong>（力矩余量 {fmt(step.torqueMargin)}）
          </li>
        </ul>
      </div>

      <h3>完整挂装次序</h3>
      <StepTable scenario={scenario} steps={plan.steps} active={idx} />
    </section>
  );
}

function InfeasibleView({ scenario, outcome }: { scenario: Scenario; outcome: Extract<AdjudicationOutcome, { feasible: false }> }) {
  const { report } = outcome;
  const d = report.witnessPrefix.length;
  const total = scenario.blocks.length;
  return (
    <section className="result bad">
      <h2>⚠ 无可行方案</h2>
      <p className="lead">
        最早无法继续挂装的位置为第 <strong>{d + 1}</strong> 步（共需 {total} 步）：
        {d === 0
          ? '第一步挂装即没有任何满足载荷与力矩限制的选择。'
          : `以下最深的可行已选前缀（长度 ${d}）满足全部限制，但从该状态出发，所有剩余挂装选择均会触发限制。`}
      </p>

      {d > 0 && (
        <>
          <h3>已选前缀（{d} 步，均满足载荷与力矩限制）</h3>
          <StepTable scenario={scenario} steps={report.witnessPrefix} />
        </>
      )}

      <h3>第 {d + 1} 步各候选选择触发的限制</h3>
      {report.violations.length === 0 ? (
        <p>（无候选选择）</p>
      ) : (
        <table className="steps">
          <thead>
            <tr>
              <th>候选配重</th>
              <th>候选位置</th>
              <th>挂后质量</th>
              <th>挂后力矩</th>
              <th>触发的限制</th>
            </tr>
          </thead>
          <tbody>
            {report.violations.map((v, i) => (
              <tr key={i}>
                <td>{v.blockName}</td>
                <td>{v.railName}</td>
                <td>
                  {fmt(v.massAfter)}（上限 {fmt(scenario.limits.maxLoad)}）
                </td>
                <td>
                  {fmt(v.torqueAfter)}（区间 [{fmt(scenario.limits.minTorque)}, {fmt(scenario.limits.maxTorque)}]）
                </td>
                <td>
                  {v.kinds.map((k) => (
                    <span key={k} className="tag warn">
                      {KIND_LABEL[k]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ResultView({ scenario, outcome }: Props) {
  return outcome.feasible ? (
    <FeasibleView scenario={scenario} outcome={outcome} />
  ) : (
    <InfeasibleView scenario={scenario} outcome={outcome} />
  );
}
