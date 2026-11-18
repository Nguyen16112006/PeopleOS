// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ConfirmProvider } from './confirm'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </StrictMode>,
)
