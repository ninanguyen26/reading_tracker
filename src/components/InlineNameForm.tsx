import { useEffect, useRef, useState } from 'react'

interface Props {
  initial?: string
  placeholder: string
  label: string
  onSubmit: (name: string) => void
  onCancel: () => void
  className?: string
}

/** A small text field for naming something; Enter saves, Escape or leaving it empty cancels. */
export default function InlineNameForm({ initial = '', placeholder, label, onSubmit, onCancel, className = '' }: Props) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <form
      className={className}
      onSubmit={e => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
        else onCancel()
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && (e.stopPropagation(), onCancel())}
        onBlur={() => (value.trim() && value.trim() !== initial ? onSubmit(value.trim()) : onCancel())}
        placeholder={placeholder}
        aria-label={label}
        maxLength={60}
        className="w-36 rounded-full border border-amber-600 bg-white px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-600/20 dark:bg-stone-900"
      />
    </form>
  )
}
