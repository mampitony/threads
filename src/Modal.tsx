import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault()
    onClose()
  }}>
    <h2 id="dialog-title">{title}</h2>
    {children}
  </dialog>
}
