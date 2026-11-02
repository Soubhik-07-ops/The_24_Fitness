/**
 * Utilities for cleaning and formatting weekly workout and diet chart content.
 * Prevents raw internal JSON strings (e.g. {"title":..., "level":...}) from leaking into UI components.
 */

export function sanitizeChartContent(rawContent?: string | null): string {
  if (!rawContent || typeof rawContent !== 'string') return '';
  let text = rawContent.trim();
  if (text.startsWith('[DRAFT]')) {
    text = text.replace(/^\[DRAFT\]\r?\n?/, '').trim();
  }
  if (!text) return '';

  // Check if content is formatted as JSON string
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        // 1. Direct content or notes strings
        if (typeof parsed.content === 'string' && parsed.content.trim()) {
          return sanitizeChartContent(parsed.content);
        }
        if (typeof parsed.notes === 'string' && parsed.notes.trim()) {
          return parsed.notes.trim();
        }
        if (typeof parsed.description === 'string' && parsed.description.trim()) {
          return parsed.description.trim();
        }
        if (typeof parsed.overview === 'string' && parsed.overview.trim()) {
          return parsed.overview.trim();
        }
        if (typeof parsed.instructions === 'string' && parsed.instructions.trim()) {
          return parsed.instructions.trim();
        }
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          return parsed.summary.trim();
        }
        if (typeof parsed.details === 'string' && parsed.details.trim()) {
          return parsed.details.trim();
        }
        if (typeof parsed.routine === 'string' && parsed.routine.trim()) {
          return parsed.routine.trim();
        }
        if (typeof parsed.plan === 'string' && parsed.plan.trim()) {
          return parsed.plan.trim();
        }

        // 2. Structured Workout Days (days, schedule, or workout_plan)
        const daysArray = Array.isArray(parsed.days)
          ? parsed.days
          : Array.isArray(parsed.schedule)
          ? parsed.schedule
          : Array.isArray(parsed.workout_plan)
          ? parsed.workout_plan
          : Array.isArray(parsed.routine)
          ? parsed.routine
          : null;

        if (daysArray && daysArray.length > 0) {
          const lines: string[] = [];
          for (const d of daysArray) {
            const dayTitle = d.dayName || d.day || 'Day';
            const focus = d.focus || d.target ? ` (${d.focus || d.target})` : '';
            const dayHeader = `${dayTitle}${focus}:`;
            const exercises: string[] = [];
            if (Array.isArray(d.exercises)) {
              for (const ex of d.exercises) {
                const exName = String(ex.name || ex.exercise || '').trim();
                if (exName) {
                  const setInfo = ex.sets && ex.reps ? ` - ${ex.sets} sets × ${ex.reps}` : '';
                  exercises.push(`• ${exName}${setInfo}`);
                }
              }
            }
            if (exercises.length > 0) {
              lines.push(dayHeader);
              lines.push(...exercises);
            }
          }
          if (lines.length > 0) {
            return lines.join('\n');
          }
        }

        // 3. Structured Diet Meals (meals or diet_plan)
        const mealsArray = Array.isArray(parsed.meals)
          ? parsed.meals
          : Array.isArray(parsed.diet_plan)
          ? parsed.diet_plan
          : null;

        if (mealsArray && mealsArray.length > 0) {
          const lines: string[] = [];
          for (const m of mealsArray) {
            const time = m.mealTime || m.time || 'Meal';
            const name = m.name || m.title ? ` (${m.name || m.title})` : '';
            const mealHeader = `${time}${name}:`;
            const items: string[] = [];
            if (Array.isArray(m.items)) {
              for (const item of m.items) {
                const itemStr = String(item || '').trim();
                if (itemStr) {
                  items.push(`• ${itemStr}`);
                }
              }
            } else if (typeof m.items === 'string' && m.items.trim()) {
              items.push(`• ${m.items.trim()}`);
            }
            if (items.length > 0) {
              lines.push(mealHeader);
              lines.push(...items);
            }
          }
          if (lines.length > 0) {
            return lines.join('\n');
          }
        }

        // 4. Flat exercises list
        if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
          const lines: string[] = [];
          for (const ex of parsed.exercises) {
            const exName = String(ex.name || ex.exercise || '').trim();
            if (exName) {
              const setInfo = ex.sets && ex.reps ? ` - ${ex.sets} sets × ${ex.reps}` : '';
              lines.push(`• ${exName}${setInfo}`);
            }
          }
          if (lines.length > 0) return lines.join('\n');
        }

        // 5. Flat items list
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const lines: string[] = [];
          for (const it of parsed.items) {
            const itStr = String(it || '').trim();
            if (itStr) lines.push(`• ${itStr}`);
          }
          if (lines.length > 0) return lines.join('\n');
        }

        // 6. Synthetic wrapper with no content
        return '';
      }
    } catch {
      // Content is not valid JSON, treat as plain text
    }
  }

  return text;
}

