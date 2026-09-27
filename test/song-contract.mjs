// Exercise the model boundary with deterministic responses and no network or credentials.
import assert from 'node:assert/strict';
import { planIssues, chordSymbol } from '../song-contract.mjs';
process.env.PROVIDER = 'mock';
const demo = await import('../ai.mjs?demo-contract');
const base = await demo.arrange('格式测试');
assert.deepEqual(planIssues(base, { review: true, duration: true }), []);
process.env.PROVIDER = 'qwen';
process.env.DASHSCOPE_API_KEY = 'offline-test-key';
process.env.QWEN_MODEL = 'offline-test-model';
delete process.env.ARRANGE_PASSES;
const { arrange } = await import('../ai.mjs?model-contract');
const originalFetch = globalThis.fetch;
const copy = () => structuredClone(base);
let calls;
async function run(responses, action) {
  calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    assert.ok(responses.length, 'Generation exceeded its expected call budget');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response instanceof Response) return response;
    return Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] });
  };
  try { await action(); } finally { globalThis.fetch = originalFetch; }
}
let count = 0;
try {
  const missing = copy(); delete missing.sections;
  const noReview = copy(); delete noReview.review;
  await run([missing, copy(), noReview, copy()], async () => {
    const plan = await arrange('格式修复');
    assert.equal(plan.passes, 2);
    assert.equal(plan.validation.review, 'complete');
    assert.deepEqual(plan.generation, { draftAttempts: 2, reviewAttempts: 2 });
    assert.match(calls[1].messages[1].content, /sections/);
    assert.match(calls[3].messages[1].content, /review/);
    count++;
  });
  const malformed = copy(); malformed.harmony.chorus = { value: '1' };
  await run([malformed, malformed], async () => {
    await assert.rejects(arrange('错误类型'), /harmony.chorus/);
    assert.equal(calls.length, 2); count++;
  });
  await run([copy(), { title: '部分复审', review: ['一', '二', '三'] }, noReview], async () => {
    const plan = await arrange('缺失复审');
    assert.equal(plan.passes, 1);
    assert.equal(plan.validation.review, 'failed');
    assert.deepEqual(plan.sections, base.sections);
    assert.deepEqual(plan.harmony, base.harmony);
    assert.match(plan.review[0], /初稿/); count++;
  });
  const short = copy(); short.sections.forEach(s => s.bars = 4);
  // Keep the shortened fixture's melodies within their new section lengths.
  for (const k of Object.keys(short.melodies)) short.melodies[k] = short.melodies[k].split(' ').filter(t => +t.split(':')[0] < 64).join(' ');
  await run([copy(), short, copy()], async () => {
    const plan = await arrange('时长修复');
    assert.equal(plan.passes, 2);
    assert.match(calls[2].messages[1].content, /实际时长/);
    assert.deepEqual(plan.sections, base.sections); count++;
  });
  const timeout = new Error('Request timed out'); timeout.name = 'TimeoutError';
  await run([timeout], async () => { await assert.rejects(arrange('超时'), /timed out/); assert.equal(calls.length, 1); count++; });
  await run([Response.json({ error: { message: 'Expired credential' } }, { status: 401 })], async () => { await assert.rejects(arrange('认证失败'), /Expired/); assert.equal(calls.length, 1); count++; });
  assert.equal(chordSymbol('5/7').bassDegree, 7);
  assert.equal(chordSymbol('1m7/b3').quality, 'm7');
  assert.equal(chordSymbol('5/9'), null);
  const inverted = copy(); inverted.harmony.chorus[0] = '5/7';
  assert.deepEqual(planIssues(inverted), []);
  const wrongReview = copy(); wrongReview.review = { changed: true };
  assert.ok(planIssues(wrongReview).some(x => x.includes('review'))); count++;
  console.log(`All ${count} model-boundary scenarios passed`);
} finally { globalThis.fetch = originalFetch; }
