import { useEffect, useMemo, useRef, useState } from 'react'

type CustomSelectOption = {
  value: string
  label: string
}

type CustomSelectProps = {
  options: CustomSelectOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export function CustomSelect({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Выберите',
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(() => options.find((item) => item.value === value) ?? null, [options, value])

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (!rootRef.current || !target) return
      if (!rootRef.current.contains(target)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onDocumentClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  return (
    <div ref={rootRef} className={`customSelect ${className} ${disabled ? 'isDisabled' : ''}`}>
      <button
        type="button"
        className={`customSelectTrigger ${open ? 'open' : ''}`}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
        }}
        disabled={disabled}
      >
        <span className="customSelectValue">{selected?.label ?? placeholder}</span>
        <span className={`customSelectChevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && !disabled && (
        <div className="customSelectMenu">
          {options.length === 0 && <div className="customSelectOption isEmpty">Нет опций</div>}
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`customSelectOption ${option.value === value ? 'isActive' : ''}`}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
