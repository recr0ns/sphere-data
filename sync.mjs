// Синхронизация данных Fitbit из Google Health в текстовую базу.
//   node /Users/user/health/sync.mjs [дней]        по умолчанию 14
//
// Пишет только между маркерами <!-- fitbit:start --> и <!-- fitbit:end -->,
// всё остальное в файлах остаётся нетронутым: ручные заметки не затираются.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { GoogleHealthClient } from '/Users/user/projects/google-health-mcp/dist/services/google-health-client.js';
import { getConfig } from '/Users/user/projects/google-health-mcp/dist/services/config.js';

const ROOT = '/Users/user/health';
const TZ = 'Europe/Moscow';
const DAYS = Number(process.argv[2] ?? 14);

const client = new GoogleHealthClient(getConfig());
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const from = new Date(today.getTime() - DAYS * 86400000);

const dayKey = (o) => {
  const d = o?.date ?? o?.civilStartTime?.date ?? {};
  return d.year ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null;
};
const local = (t, opts) => new Date(t).toLocaleString('ru-RU', { timeZone: TZ, ...opts });
const hhmm = (t) => local(t, { hour: '2-digit', minute: '2-digit' });
const localDay = (t) => {
  const parts = new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
  return parts;
};

/** Заменяет размеченный блок, создавая файл с заголовком, если его ещё нет. */
function writeBlock(file, heading, body) {
  const path = `${ROOT}/${file}`;
  const block = `<!-- fitbit:start -->\n${body}\n<!-- fitbit:end -->`;
  if (!existsSync(path)) {
    writeFileSync(path, `${heading}\n\n${block}\n`);
    return;
  }
  const current = readFileSync(path, 'utf8');
  if (current.includes('<!-- fitbit:start -->')) {
    writeFileSync(path, current.replace(/<!-- fitbit:start -->[\s\S]*?<!-- fitbit:end -->/, block));
  } else {
    writeFileSync(path, `${current.trimEnd()}\n\n${block}\n`);
  }
}

// У части типов Google ограничивает глубину роллапа: total-calories — 14 дней.
const ROLLUP_MAX_DAYS = { 'total-calories': 14 };

const rollup = async (dataType) => {
  const span = Math.min(DAYS, (ROLLUP_MAX_DAYS[dataType] ?? DAYS) - 1);
  const start = new Date(today.getTime() - span * 86400000);
  // pageSize обязан покрывать весь диапазон: одна строка на день плюс запас.
  const res = await client.dailyRollup({
    dataType,
    startDate: iso(start),
    endDate: iso(new Date(today.getTime() + 86400000)),
    pageSize: span + 2,
  });
  const out = {};
  for (const point of res.rollupDataPoints ?? []) {
    const key = dayKey(point);
    const value = point[Object.keys(point).find((k) => !k.startsWith('civil'))] ?? {};
    out[key] = Number(value.countSum ?? value.kcalSum ?? 0);
  }
  return out;
};

const daily = async (dataType, field, pick) => {
  const res = await client.listDataPoints({ dataType, pageSize: 60 });
  const out = {};
  for (const point of res.dataPoints ?? []) {
    const value = point[field];
    if (!value) continue;
    out[dayKey(value)] = pick(value);
  }
  return out;
};

const [steps, totalKcal, activeKcal, rhr, hrv, spo2, breath] = await Promise.all([
  rollup('steps'),
  rollup('total-calories'),
  rollup('active-energy-burned'),
  daily('daily-resting-heart-rate', 'dailyRestingHeartRate', (v) => ({
    bpm: Number(v.beatsPerMinute),
    method: v.dailyRestingHeartRateMetadata?.calculationMethod,
  })),
  daily('daily-heart-rate-variability', 'dailyHeartRateVariability', (v) => Number(v.averageHeartRateVariabilityMilliseconds)),
  daily('daily-oxygen-saturation', 'dailyOxygenSaturation', (v) => Number(v.averagePercentage ?? v.average ?? 0)),
  daily('daily-respiratory-rate', 'dailyRespiratoryRate', (v) => Number(v.averageBreathsPerMinute ?? v.average ?? 0)),
]);

// --- сон ---
const sleepRes = await client.listDataPoints({ dataType: 'sleep', pageSize: 30 });
const sleeps = (sleepRes.dataPoints ?? []).map((p) => {
  const s = p.sleep ?? {}, iv = s.interval ?? {};
  const stages = Object.fromEntries((s.summary?.stagesSummary ?? []).map((x) => [x.type, Number(x.minutes)]));
  return {
    day: localDay(iv.endTime),
    from: hhmm(iv.startTime),
    to: hhmm(iv.endTime),
    asleep: Number(s.summary?.minutesAsleep ?? 0),
    awake: Number(s.summary?.minutesAwake ?? 0),
    deep: stages.DEEP ?? 0,
    rem: stages.REM ?? 0,
    light: stages.LIGHT ?? 0,
  };
}).sort((a, b) => b.day.localeCompare(a.day));

// --- тренировки ---
const exRes = await client.listDataPoints({ dataType: 'exercise', pageSize: 40 });
const sessions = (exRes.dataPoints ?? []).map((p) => {
  const e = p.exercise ?? {}, iv = e.interval ?? {};
  return {
    day: localDay(iv.startTime),
    time: hhmm(iv.startTime),
    type: e.exerciseType ?? '?',
    minutes: Math.round((new Date(iv.endTime) - new Date(iv.startTime)) / 60000),
    kcal: Math.round(Number(JSON.stringify(e).match(/"kcal":([0-9.]+)/)?.[1] ?? 0)),
  };
}).sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));

// --- запись ---
const stamp = local(today, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const num = (x) => (x ? Math.round(x) : '—');

const activityDays = [...new Set([...Object.keys(steps), ...Object.keys(totalKcal)])].filter(Boolean).sort().reverse();
writeBlock('activity.md', '# Активность и расход', [
  `Обновлено: ${stamp}. Источник: Fitbit через Google Health, скрипт \`sync.mjs\`.`,
  '',
  '| Дата | Шаги | Расход всего, ккал | Активные, ккал |',
  '| --- | ---: | ---: | ---: |',
  ...activityDays.map((d) => `| ${d} | ${num(steps[d])} | ${num(totalKcal[d])} | ${num(activeKcal[d])} |`),
  '',
  '«Расход всего» — фактический TDEE за сутки: основной обмен плюс активность.',
  'Сравнивать с калорийностью из `food/` за тот же день: разница и есть профицит или дефицит.',
].join('\n'));

const recoveryDays = [...new Set([...Object.keys(rhr), ...Object.keys(hrv), ...sleeps.map((s) => s.day)])].filter(Boolean).sort().reverse();
writeBlock('recovery.md', '# Восстановление', [
  `Обновлено: ${stamp}. Источник: Fitbit через Google Health, скрипт \`sync.mjs\`.`,
  '',
  '| Дата | Сон | Глубокий | REM | Пробуждения, мин | Пульс покоя | HRV, мс | SpO2, % | Дыхание |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...recoveryDays.map((d) => {
    const s = sleeps.find((x) => x.day === d);
    const sleepCell = s ? `${(s.asleep / 60).toFixed(1)} ч (${s.from}–${s.to})` : '—';
    const r = rhr[d];
    const rhrCell = r ? `${r.bpm}${r.method === 'ONLY_WITH_AWAKE_DATA' ? ' ⚠' : ''}` : '—';
    return `| ${d} | ${sleepCell} | ${s ? s.deep : '—'} | ${s ? s.rem : '—'} | ${s ? s.awake : '—'} | ${rhrCell} | ${hrv[d] ?? '—'} | ${num(spo2[d])} | ${num(breath[d])} |`;
  }),
  '',
  '⚠ у пульса покоя — посчитан только по дневным данным: часы не видели сон, значение завышено и с остальными днями несравнимо.',
  '',
  'Пульс покоя выше своего среднего на 5+ ударов или заметно просевший HRV — сигнал недовосстановления: силовую лучше сдвинуть.',
].join('\n'));

writeBlock('training.md', '# Тренировки', [
  `Обновлено: ${stamp}. Источник: Fitbit через Google Health, скрипт \`sync.mjs\`.`,
  '',
  '| Дата | Время | Тип | Длительность | Ккал |',
  '| --- | --- | --- | ---: | ---: |',
  ...sessions.map((s) => `| ${s.day} | ${s.time} | ${s.type} | ${s.minutes} мин | ${s.kcal || '—'} |`),
  '',
  'Шаффл часы опознают как ходьбу или не видят вовсе — такие сессии отмечать вручную ниже.',
].join('\n'));

console.log(`активность: ${activityDays.length} дн · восстановление: ${recoveryDays.length} дн · тренировки: ${sessions.length}`);
