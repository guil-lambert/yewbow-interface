import { useEffect } from 'react'
import { useAppDispatch } from 'state/hooks'

import { updateMatchesDarkMode } from './actions'

export default function Updater(): null {
  const dispatch = useAppDispatch()

  // keep dark mode in sync with the system
  return null
}
