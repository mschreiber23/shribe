import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Upload, GripVertical, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getPlans, getPlan, createPlan, updatePlan, deletePlan, addExercise, updateExercise, deleteExercise, importCSV } from '../api';
import Button from '../components/Button';
import Modal from '../components/Modal';

function ExerciseItem({ exercise, planId, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [notes, setNotes] = useState(exercise.notes || '');
  const qc = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateExercise(planId, exercise.id, { name, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', planId] });
      setEditing(false);
      toast.success('Exercise updated');
    },
  });

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg group"
      style={{ backgroundColor: 'var(--color-surface-3)' }}
    >
      <GripVertical size={16} className="shrink-0 opacity-30" />
      {editing ? (
        <div className="flex-1 space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Exercise name"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
          />
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save()} loading={isPending}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{exercise.name}</div>
            {exercise.notes && (
              <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{exercise.notes}</div>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
              <Edit2 size={13} style={{ color: 'var(--color-text-muted)' }} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-500/20 transition-colors">
              <Trash2 size={13} className="text-red-400" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExNotes, setNewExNotes] = useState('');
  const [addingEx, setAddingEx] = useState(false);
  const qc = useQueryClient();

  const { data: fullPlan } = useQuery({
    queryKey: ['plan', plan.id],
    queryFn: () => getPlan(plan.id),
    enabled: expanded,
  });

  const { mutate: removeEx } = useMutation({
    mutationFn: (exId) => deleteExercise(plan.id, exId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', plan.id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Exercise removed');
    },
  });

  const { mutate: addEx, isPending: addingPending } = useMutation({
    mutationFn: () => addExercise(plan.id, { name: newExName, notes: newExNotes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan', plan.id] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      setNewExName('');
      setNewExNotes('');
      setAddingEx(false);
      toast.success('Exercise added');
    },
  });

  const { mutate: removePlan } = useMutation({
    mutationFn: () => deletePlan(plan.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success('Plan deleted');
    },
  });

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">{plan.name}</h3>
          {plan.description && (
            <p className="text-sm truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{plan.description}</p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {plan.exercise_count} {plan.exercise_count === 1 ? 'exercise' : 'exercises'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => onEdit(plan)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <Edit2 size={15} style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${plan.name}"?`)) removePlan();
            }}
            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={15} className="text-red-400" />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="pt-3 space-y-1.5">
            {fullPlan?.exercises?.map(ex => (
              <ExerciseItem key={ex.id} exercise={ex} planId={plan.id} onDelete={() => removeEx(ex.id)} />
            ))}
            {fullPlan?.exercises?.length === 0 && (
              <p className="text-sm text-center py-3" style={{ color: 'var(--color-text-muted)' }}>No exercises yet</p>
            )}
          </div>

          {addingEx ? (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--color-surface-3)' }}>
              <input
                value={newExName}
                onChange={e => setNewExName(e.target.value)}
                placeholder="Exercise name *"
                autoFocus
                style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
              />
              <input
                value={newExNotes}
                onChange={e => setNewExNotes(e.target.value)}
                placeholder="Notes (optional)"
                style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addEx()} loading={addingPending} disabled={!newExName.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingEx(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingEx(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}
            >
              <Plus size={14} />
              Add Exercise
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreatePlanModal({ open, onClose, editing }) {
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [exercises, setExercises] = useState([{ name: '', notes: '' }]);
  const qc = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => editing
      ? updatePlan(editing.id, { name, description })
      : createPlan({ name, description, exercises: exercises.filter(e => e.name.trim()) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(editing ? 'Plan updated' : 'Plan created');
      onClose();
    },
  });

  const addRow = () => setExercises(v => [...v, { name: '', notes: '' }]);
  const removeRow = (i) => setExercises(v => v.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setExercises(v => v.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Plan' : 'Create Plan'}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Plan Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Push Day, Upper Body, Leg Day..."
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>

        {!editing && (
          <div>
            <label className="block text-sm font-medium mb-2">Exercises</label>
            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={ex.name}
                    onChange={e => updateRow(i, 'name', e.target.value)}
                    placeholder={`Exercise ${i + 1}`}
                    style={{ flex: 2 }}
                  />
                  <input
                    value={ex.notes}
                    onChange={e => updateRow(i, 'notes', e.target.value)}
                    placeholder="Notes"
                    style={{ flex: 1 }}
                  />
                  {exercises.length > 1 && (
                    <button onClick={() => removeRow(i)} className="p-2 rounded hover:bg-red-500/20 transition-colors shrink-0">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addRow}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }}
              >
                <Plus size={14} /> Add Exercise
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={() => save()} loading={isPending} disabled={!name.trim()}>
            {editing ? 'Save Changes' : 'Create Plan'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportCSVModal({ open, onClose }) {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const qc = useQueryClient();

  const { mutate: doImport, isPending } = useMutation({
    mutationFn: () => importCSV(file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      toast.success(`Imported ${data.imported} plan(s)!`);
      onClose();
      setFile(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Import failed');
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Import from CSV/Spreadsheet">
      <div className="space-y-4">
        <div
          className="rounded-xl p-4 text-sm space-y-1"
          style={{ backgroundColor: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
        >
          <p className="font-medium">Expected CSV format:</p>
          <p style={{ color: 'var(--color-text-muted)' }}>Your CSV must have these columns:</p>
          <code
            className="block p-2 rounded text-xs mt-2"
            style={{ backgroundColor: 'var(--color-surface)', color: '#a5f3fc' }}
          >
            plan_name, exercise_name, notes, plan_description
          </code>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Each row is one exercise. Rows with the same plan_name are grouped into one plan.
            Export your spreadsheet as CSV and upload it here.
          </p>
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={e => setFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full p-8 rounded-xl flex flex-col items-center gap-3 transition-colors hover:bg-white/5"
            style={{ border: '2px dashed var(--color-border)' }}
          >
            <FileSpreadsheet size={32} style={{ color: 'var(--color-text-muted)' }} />
            {file ? (
              <div className="text-center">
                <div className="font-medium">{file.name}</div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="font-medium">Click to select CSV file</div>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>or drag and drop</div>
              </div>
            )}
          </button>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => doImport()} loading={isPending} disabled={!file}>
            <Upload size={16} />
            Import
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Plans() {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workout Plans</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            <Upload size={15} />
            Import CSV
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowCreate(true); }}>
            <Plus size={15} />
            New Plan
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      )}

      {!isLoading && plans?.length === 0 && (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: '1px dashed var(--color-border)' }}
        >
          <p className="text-lg font-medium mb-1">No plans yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Create a plan manually or import from a CSV spreadsheet
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create Plan
            </Button>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={15} /> Import CSV
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {plans?.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onEdit={(p) => { setEditing(p); setShowCreate(true); }}
          />
        ))}
      </div>

      <CreatePlanModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        editing={editing}
      />
      <ImportCSVModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
