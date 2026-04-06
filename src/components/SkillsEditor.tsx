import { useState } from 'react';
import { SKILLS, upsertStudentSkills, updateStudentLinks, type StudentWithSkills, type SkillKey } from '../lib/supabase';

interface Props {
  students: StudentWithSkills[];
  onSaved?: (studentId: string) => void;
}

type SaveState = 'idle' | 'saving' | 'ok' | 'error';

export default function SkillsEditor({ students, onSaved }: Props) {
  const [selectedId, setSelectedId] = useState<string>(students[0]?.id ?? '');
  const [values, setValues] = useState<Record<SkillKey, number>>(() => buildInitialSkills(students[0]));
  const [artstation, setArtstation] = useState<string>(students[0]?.artstation_url ?? '');
  const [instagram, setInstagram] = useState<string>(students[0]?.instagram_url ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  function buildInitialSkills(student?: StudentWithSkills): Record<SkillKey, number> {
    const base = Object.fromEntries(SKILLS.map((s) => [s.key, 0])) as Record<SkillKey, number>;
    if (!student) return base;
    for (const sk of student.student_skills) base[sk.skill_name] = sk.value;
    return base;
  }

  function handleStudentChange(id: string) {
    setSelectedId(id);
    const student = students.find((s) => s.id === id);
    setValues(buildInitialSkills(student));
    setArtstation(student?.artstation_url ?? '');
    setInstagram(student?.instagram_url ?? '');
    setSaveState('idle');
  }

  function handleSlider(key: SkillKey, val: number) {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (saveState !== 'idle') setSaveState('idle');
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaveState('saving');
    const skills = SKILLS.map((s) => ({ skill_name: s.key, value: values[s.key] }));
    const [okSkills, okLinks] = await Promise.all([
      upsertStudentSkills(selectedId, skills),
      updateStudentLinks(selectedId, artstation || null, instagram || null),
    ]);
    const ok = okSkills && okLinks;
    setSaveState(ok ? 'ok' : 'error');
    if (ok) onSaved?.(selectedId);
  }

  return (
    <section className="skills-editor">
      <h2 className="skills-editor-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        </svg>
        Editor de Habilidades
      </h2>

      {/* Selector */}
      <div className="skills-editor-row">
        <label className="skills-editor-label" htmlFor="student-select">Estudiante</label>
        <select
          id="student-select"
          className="skills-editor-select"
          value={selectedId}
          onChange={(e) => handleStudentChange(e.target.value)}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      {/* Sliders */}
      <div className="skills-editor-sliders">
        {SKILLS.map((skill) => (
          <div key={skill.key} className="skills-slider-row">
            <span className="skills-slider-label">{skill.label}</span>
            <input
              type="range" min={0} max={100} step={1}
              value={values[skill.key]}
              onChange={(e) => handleSlider(skill.key, Number(e.target.value))}
              className="skills-slider"
              aria-label={skill.label}
            />
            <span className="skills-slider-value">{values[skill.key]}</span>
          </div>
        ))}
      </div>

      {/* Links */}
      <div className="skills-editor-links">
        <div className="skills-editor-row">
          <label className="skills-editor-label" htmlFor="artstation-input">ArtStation</label>
          <input
            id="artstation-input"
            type="url"
            className="skills-editor-input"
            placeholder="https://www.artstation.com/usuario"
            value={artstation}
            onChange={(e) => { setArtstation(e.target.value); if (saveState !== 'idle') setSaveState('idle'); }}
          />
        </div>
        <div className="skills-editor-row">
          <label className="skills-editor-label" htmlFor="instagram-input">Instagram</label>
          <input
            id="instagram-input"
            type="url"
            className="skills-editor-input"
            placeholder="https://www.instagram.com/usuario"
            value={instagram}
            onChange={(e) => { setInstagram(e.target.value); if (saveState !== 'idle') setSaveState('idle'); }}
          />
        </div>
      </div>

      {/* Guardar */}
      <div className="skills-editor-footer">
        <button
          className={`skills-save-btn ${saveState}`}
          onClick={handleSave}
          disabled={saveState === 'saving' || !selectedId}
        >
          {saveState === 'saving' && 'Guardando…'}
          {saveState === 'ok' && '✓ Guardado'}
          {saveState === 'error' && '✗ Error — reintentar'}
          {saveState === 'idle' && 'Guardar habilidades'}
        </button>
      </div>
    </section>
  );
}
