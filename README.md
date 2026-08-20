# Данные здоровья

Приватный репозиторий: только данные. Таблицы лежат в CSV, документы рядом дают
контекст и ссылаются на них. Инструменты и правила ведения — в репозитории решения
(`../README.md`, `../AGENTS.md`).

## Таблицы

| Файл | Что внутри | Колонки |
| --- | --- | --- |
| [csv/food.csv](csv/food.csv) | Приёмы пищи | `date, time, meal, name, kcal, protein_g, fat_g, carbs_g, sodium_mg, note` |
| [csv/water.csv](csv/water.csv) | Жидкость | `date, time, ml, source` |
| [csv/weight.csv](csv/weight.csv) | Взвешивания | `date, kg, conditions, note` |
| [csv/training.csv](csv/training.csv) | Тренировки | `date, time, type, minutes, kcal, source, details` |
| [csv/activity.csv](csv/activity.csv) | Шаги и суточный расход | `date, steps, total_kcal, active_kcal` |
| [csv/sleep.csv](csv/sleep.csv) | Сон по ночам | `date, from, to, asleep_min, awake_min, deep_min, rem_min` |
| [csv/vitals.csv](csv/vitals.csv) | Пульс покоя, HRV, SpO2 | `date, resting_hr, hrv_ms, spo2, resting_hr_awake_only` |
| [csv/recovery.csv](csv/recovery.csv) | Массаж, баня и прочее | `date, procedure, duration, note` |
| [csv/labs.csv](csv/labs.csv) | Анализы | `date, marker, value, unit, reference, lab` |
| [csv/wellbeing.csv](csv/wellbeing.csv) | Самочувствие и отдых | `date, metric, value, note` |

`activity.csv`, `sleep.csv`, `vitals.csv` и строки `source=fitbit` в `training.csv`
перезаписываются синхронизацией с часами. Остальное заполняется вручную или агентом.

Итоги за день нигде не хранятся — они считаются из таблиц при чтении. Так они не могут
разойтись с данными.

## Документы

- [profile.md](profile.md) — рост, возраст, расчётные величины, цели
- [nutrition.md](nutrition.md) — как оценивается питание
- [training.md](training.md) — что записывать руками
- [recovery.md](recovery.md) — сон и сигналы недовосстановления
- [labs.md](labs.md) — анализы, врачи, прививки
