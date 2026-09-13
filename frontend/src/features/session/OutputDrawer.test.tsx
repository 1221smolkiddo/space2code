import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OutputDrawer } from './OutputDrawer'
import type { EditorCardState } from '../../store/sessionStore'

const initial: EditorCardState = { stdin: '', stdout: '', stderr: '', outputState: 'idle', isOutputOpen: true, permission: 'none' }

describe('unified batch terminal', () => {
  it('always shows multiline input alongside output without tabs, including during a run', () => {
    let state = initial
    const change = (stdin: string) => { state = { ...state, stdin }; view.rerender(drawer()) }
    const drawer = () => <OutputDrawer title="Your Terminal" state={state} onStdinChange={change} />
    const view = render(drawer())
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /stdin|output/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Interactive Stdin')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Input for next run'), { target: { value: 'Alice\n21\nHyderabad\n' } })
    act(() => { state = { ...state, outputState: 'running' }; view.rerender(drawer()) })
    expect(screen.getByRole('textbox')).toHaveValue('Alice\n21\nHyderabad\n')
    expect(screen.getByRole('textbox')).not.toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'next\nrun' } })
    act(() => { state = { ...state, outputState: 'error', stdout: 'Enter name: ', stderr: 'EOFError: EOF when reading a line' }; view.rerender(drawer()) })
    expect(screen.getByText('Enter name:')).toHaveTextContent('EOFError')
    expect(screen.getByRole('textbox')).toHaveValue('next\nrun')
    act(() => { state = { ...state, executionId: 'next', outputState: 'success', stdout: 'Hello Alice', stderr: '' }; view.rerender(drawer()) })
    expect(screen.getByText('Hello Alice')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('next\nrun')
  })

  it('allows native Enter and runs with Ctrl+Enter without clearing input or starting duplicate runs', () => {
    const run = vi.fn(), change = vi.fn(), bubble = vi.fn()
    const view = render(<div onKeyDown={bubble}><OutputDrawer title="Your Terminal" state={{ ...initial, stdin: 'Alice\n21' }} onRun={run} onStdinChange={change} /></div>)
    const input = screen.getByRole('textbox')
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    expect(run).not.toHaveBeenCalled()
    expect(bubble).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
    expect(change).not.toHaveBeenCalled()
    view.rerender(<OutputDrawer title="Your Terminal" state={{ ...initial, outputState: 'running' }} onRun={run} onStdinChange={change} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('copies both streams, supports stderr-only output, and retains close', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined), close = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const view = render(<OutputDrawer title="Grace's Terminal" state={{ ...initial, stdout: 'prompt\n', stderr: 'error\n' }} onStdinChange={vi.fn()} onClose={close} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Output' })) })
    expect(writeText).toHaveBeenLastCalledWith('prompt\n\nerror\n')
    view.rerender(<OutputDrawer title="Grace's Terminal" state={{ ...initial, stderr: 'error only' }} onStdinChange={vi.fn()} onClose={close} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Output' })) })
    expect(writeText).toHaveBeenLastCalledWith('error only')
    fireEvent.click(screen.getByRole('button', { name: 'Close Console' }))
    expect(close).toHaveBeenCalledOnce()
  })
})
