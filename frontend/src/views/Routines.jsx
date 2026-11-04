import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { RoutinesList } from './Plan.jsx'

export default function Routines() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  return <div className="narrow plan routines-view"><RoutinesList S={S} update={update} nav={nav} /></div>
}
