import { useState } from 'react';
import { adjudicate } from './solver/adjudicate';
import type { AdjudicationOutcome, Scenario } from './solver/types';
import {
  BLOCK_COUNT_MAX,
  BLOCK_COUNT_MIN,
  OPTIONS_PER_BLOCK_MAX,
  RAIL_COUNT_MAX,
  RAIL_COUNT_MIN,
} from './solver/validate';
import { defaultDraft, nextId, parseDraft, type Draft } from './draft';
import { ResultView } from './components/ResultView';

interface Adjudicated {
  scenario: Scenario;
  outcome: AdjudicationOutcome;
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [result, setResult] = useState<Adjudicated | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [round, setRound] = useState(0);

  /** 任一草稿编辑立即撤销旧方案。 */
  const mutateDraft = (mut: (d: Draft) => Draft) => {
    setDraft(mut);
    if (result !== null) {
      setResult(null);
      setRevoked(true);
    }
  };

  const onAdjudicate = () => {
    const parsed = parseDraft(draft);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      setResult(null);
      return;
    }
    setErrors([]);
    setRevoked(false);
    setResult({ scenario: parsed.scenario, outcome: adjudicate(parsed.scenario) });
    setRound((r) => r + 1);
  };

  const railName = (id: string) => draft.rails.find((r) => r.id === id)?.name ?? id;

  return (
    <main>
      <header>
        <h1>剧场升降幕配重挂装裁决</h1>
        <p>
          录入 4~7 块配重（质量、2~3 个可挂导轨位置及各位置安装代价）与卷扬轴限制（总载荷上限、左右力矩闭区间），
          点击「裁决」联合确定每块配重恰用一次的挂入位置与完整挂装次序；每个前缀状态都同时满足载荷与力矩限制。
          多套可行方案依次按：力矩余量最大 → 总安装代价最小 → 挂装顺序与位置录入序号稳定决胜。
        </p>
      </header>

      <section className="panel">
        <h2>
          导轨位置 <small>（{draft.rails.length} 个，力臂左负右正）</small>
        </h2>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>力臂坐标</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {draft.rails.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    value={r.name}
                    onChange={(e) =>
                      mutateDraft((d) => ({
                        ...d,
                        rails: d.rails.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    value={r.coordinate}
                    onChange={(e) =>
                      mutateDraft((d) => ({
                        ...d,
                        rails: d.rails.map((x) => (x.id === r.id ? { ...x, coordinate: e.target.value } : x)),
                      }))
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    disabled={draft.rails.length <= RAIL_COUNT_MIN}
                    onClick={() =>
                      mutateDraft((d) => ({
                        ...d,
                        rails: d.rails.filter((x) => x.id !== r.id),
                        blocks: d.blocks.map((b) => ({ ...b, options: b.options.filter((o) => o.railId !== r.id) })),
                      }))
                    }
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          disabled={draft.rails.length >= RAIL_COUNT_MAX}
          onClick={() =>
            mutateDraft((d) => ({
              ...d,
              rails: [...d.rails, { id: nextId(), name: `导轨${d.rails.length + 1}`, coordinate: '0' }],
            }))
          }
        >
          + 添加导轨位置
        </button>
      </section>

      <section className="panel">
        <h2>
          幕布配重 <small>（{draft.blocks.length} 块，须 {BLOCK_COUNT_MIN}~{BLOCK_COUNT_MAX} 块；每块勾选 2~{OPTIONS_PER_BLOCK_MAX} 个可挂位置并填安装代价）</small>
        </h2>
        {draft.blocks.map((b, bi) => (
          <div className="card" key={b.id}>
            <div className="row">
              <label>
                名称
                <input
                  value={b.name}
                  onChange={(e) =>
                    mutateDraft((d) => ({
                      ...d,
                      blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)),
                    }))
                  }
                />
              </label>
              <label>
                质量
                <input
                  value={b.mass}
                  onChange={(e) =>
                    mutateDraft((d) => ({
                      ...d,
                      blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, mass: e.target.value } : x)),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                disabled={draft.blocks.length <= BLOCK_COUNT_MIN}
                onClick={() => mutateDraft((d) => ({ ...d, blocks: d.blocks.filter((x) => x.id !== b.id) }))}
              >
                删除此块
              </button>
            </div>
            <div className="row wrap">
              {draft.rails.map((r) => {
                const optIndex = b.options.findIndex((o) => o.railId === r.id);
                const checked = optIndex >= 0;
                return (
                  <span key={r.id} className={checked ? 'opt on' : 'opt'}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          mutateDraft((d) => ({
                            ...d,
                            blocks: d.blocks.map((x) => {
                              if (x.id !== b.id) return x;
                              if (e.target.checked) {
                                if (x.options.length >= OPTIONS_PER_BLOCK_MAX) return x;
                                return { ...x, options: [...x.options, { railId: r.id, cost: '0' }] };
                              }
                              return { ...x, options: x.options.filter((o) => o.railId !== r.id) };
                            }),
                          }))
                        }
                      />
                      {r.name}（力臂 {r.coordinate}）
                    </label>
                    {checked && (
                      <label>
                        代价
                        <input
                          className="cost"
                          value={b.options[optIndex].cost}
                          onChange={(e) =>
                            mutateDraft((d) => ({
                              ...d,
                              blocks: d.blocks.map((x) =>
                                x.id === b.id
                                  ? { ...x, options: x.options.map((o, j) => (j === optIndex ? { ...o, cost: e.target.value } : o)) }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </label>
                    )}
                  </span>
                );
              })}
            </div>
            <small>
              位置录入序号：
              {b.options.length === 0
                ? '（尚未勾选）'
                : b.options.map((o, j) => `#${j + 1} ${railName(o.railId)}`).join('，')}
            </small>
            {bi === draft.blocks.length - 1 && (
              <div>
                <button
                  type="button"
                  disabled={draft.blocks.length >= BLOCK_COUNT_MAX}
                  onClick={() =>
                    mutateDraft((d) => ({
                      ...d,
                      blocks: [
                        ...d.blocks,
                        {
                          id: nextId(),
                          name: `配重${'甲乙丙丁戊己庚'[d.blocks.length] ?? d.blocks.length + 1}`,
                          mass: '20',
                          options: d.rails.slice(0, 2).map((r) => ({ railId: r.id, cost: '0' })),
                        },
                      ],
                    }))
                  }
                >
                  + 添加配重块
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>卷扬轴限制</h2>
        <div className="row">
          <label>
            总载荷上限
            <input value={draft.maxLoad} onChange={(e) => mutateDraft((d) => ({ ...d, maxLoad: e.target.value }))} />
          </label>
          <label>
            力矩区间下端（左）
            <input value={draft.minTorque} onChange={(e) => mutateDraft((d) => ({ ...d, minTorque: e.target.value }))} />
          </label>
          <label>
            力矩区间上端（右）
            <input value={draft.maxTorque} onChange={(e) => mutateDraft((d) => ({ ...d, maxTorque: e.target.value }))} />
          </label>
        </div>
      </section>

      <div className="action">
        <button type="button" className="primary" onClick={onAdjudicate}>
          裁决
        </button>
      </div>

      {errors.length > 0 && (
        <section className="result bad">
          <h2>录入有误，无法裁决</h2>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {revoked && result === null && errors.length === 0 && (
        <p className="notice">草稿已修改，旧方案已撤销，请重新点击「裁决」。</p>
      )}

      {result && <ResultView key={round} scenario={result.scenario} outcome={result.outcome} />}
    </main>
  );
}
