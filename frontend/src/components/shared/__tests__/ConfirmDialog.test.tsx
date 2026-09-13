import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { renderWithProviders } from '@/test/render'

describe('ConfirmDialog', () => {
  it('renders title, description and the confirm label; cancel closes', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this job description?"
        description="Candidates stay attached; the JD leaves the open list."
        confirmLabel="Archive"
        onConfirm={onConfirm}
      />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Archive this job description?' })
    expect(dialog).toHaveTextContent('Candidates stay attached; the JD leaves the open list.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm and closes after an async confirm resolves', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    let resolve!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    renderWithProviders(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Publish?" onConfirm={onConfirm} />,
    )
    const confirm = await screen.findByRole('button', { name: 'Confirm' })
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    resolve()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('stays open when the confirm handler rejects', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn(() => Promise.reject(new Error('nope')))
    renderWithProviders(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Publish?" onConfirm={onConfirm} />,
    )
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('marks a destructive confirm and requires the phrase to be typed exactly', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Delete Senior Python Developer?"
        confirmLabel="Delete job description"
        destructive
        requireTyping="Senior Python Developer"
        onConfirm={onConfirm}
      />,
    )
    const confirm = await screen.findByRole('button', { name: 'Delete job description' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('data-destructive', 'true')

    const input = screen.getByRole('textbox', { name: /Type Senior Python Developer to confirm/ })
    await user.type(input, 'senior python')
    expect(confirm).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'Senior Python Developer')
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
