import { useDraggable } from '@dnd-kit/core'

export default function TaskItem({ task, members = [] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined

  const assignedMembers = members.filter((m) => task.assigned_to?.includes(m.student_id))
  const deadline = task.deadline ? new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg border border-border bg-bg p-3 transition-colors hover:border-primary active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm font-medium text-text">{task.title}</p>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p>}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-2">
          {assignedMembers.map((m) => (
            <div
              key={m.student_id}
              title={m.student_profiles?.name}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-primary/30 text-[10px] font-bold text-accent"
            >
              {m.student_profiles?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          ))}
        </div>
        {deadline && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">{deadline}</span>
        )}
      </div>
    </div>
  )
}
