import {act,fireEvent,render,screen} from '@testing-library/react'
import {describe,expect,it} from 'vitest'
import {OutputDrawer} from './OutputDrawer'
import type {EditorCardState} from '../../store/sessionStore'

describe('batch stdin terminal',()=>{
  it('keeps multiline stdin across tabs and reveals both prompt and execution error',()=>{
    let state:EditorCardState={stdin:'',stdout:'',stderr:'',outputState:'idle',isOutputOpen:true,permission:'none'}
    const change=(stdin:string)=>{state={...state,stdin};view.rerender(drawer())}
    const drawer=()=> <OutputDrawer title="Your Terminal" state={state} onStdinChange={change}/>
    const view=render(drawer())
    fireEvent.click(screen.getByText('Stdin'))
    fireEvent.change(screen.getByPlaceholderText('Enter standard input values here...'),{target:{value:'Alice\n22\n'}})
    fireEvent.click(screen.getByText('Output'))
    fireEvent.click(screen.getByText('Stdin'))
    expect(screen.getByRole('textbox')).toHaveValue('Alice\n22\n')
    act(()=>{state={...state,outputState:'running'};view.rerender(drawer())})
    act(()=>{state={...state,outputState:'error',stdout:'Enter name: ',stderr:'EOFError: EOF when reading a line'};view.rerender(drawer())})
    expect(screen.getByText(/EOFError/)).toHaveTextContent('Enter name:')
    fireEvent.click(screen.getByText('Stdin'))
    expect(screen.getByRole('textbox')).toHaveValue('Alice\n22\n')
    act(()=>{state={...state,executionId:'next',outputState:'success',stdout:'Hello Alice',stderr:''};view.rerender(drawer())})
    expect(screen.getByText('Hello Alice')).toBeInTheDocument()
  })
})
