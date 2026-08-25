import { fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ModalDialog } from './ModalDialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open</button>{open && (
    <ModalDialog className="test-dialog" labelledBy="title" onClose={() => setOpen(false)}>
      <h2 id="title">Dialog</h2><button>First</button><button>Last</button>
    </ModalDialog>
  )}</>
}

describe('ModalDialog', () => {
  it('moves and traps focus, closes on Escape, then restores focus', async () => {
    const view = render(<Harness />)
    const opener = view.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    const first = view.getByRole('button', { name: 'First' })
    const last = view.getByRole('button', { name: 'Last' })
    await waitFor(() => expect(first).toHaveFocus())
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(opener).toHaveFocus())
  })
})
