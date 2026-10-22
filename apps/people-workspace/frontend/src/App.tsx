import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import Layout from '@/components/Layout'
import { RealtimeProvider } from '@/hooks/realtime'
import { ToastProvider } from '@/hooks/toast'
import Advances from '@/pages/Advances'
import Approvals from '@/pages/Approvals'
import Audit from '@/pages/Audit'
import Executive from '@/pages/Executive'
import Lineage from '@/pages/Lineage'
import Assistant from '@/pages/Assistant'
import Contracts from '@/pages/Contracts'
import Dashboard from '@/pages/Dashboard'
import Insurance from '@/pages/Insurance'
import Kpi from '@/pages/Kpi'
import Leave from '@/pages/Leave'
import Payroll from '@/pages/Payroll'
import TaxYear from '@/pages/TaxYear'
import Offboarding from '@/pages/Offboarding'
import TempAccess from '@/pages/TempAccess'
import Onboarding from '@/pages/Onboarding'
import Payslips from '@/pages/Payslips'
import Profile from '@/pages/Profile'
import Proposals from '@/pages/Proposals'
import type { ReactElement } from 'react'

/** Chặn truy cập trang theo vai trò (dữ liệu vẫn được Hasura/BFF bảo vệ ở phía server). */
function Guard({ roles, children }: { roles: string[]; children: ReactElement }) {
  const { hasRole } = useAuth()
  return hasRole(...roles) ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="profile" element={<Profile />} />
                <Route path="contracts" element={<Contracts />} />
                <Route path="payslips" element={<Payslips />} />
                <Route path="insurance" element={<Insurance />} />
                <Route path="leave" element={<Leave />} />
                <Route path="tax-year" element={<TaxYear />} />
                <Route path="kpi" element={<Kpi />} />
                <Route path="offboarding" element={<Offboarding />} />
                <Route path="payroll" element={<Guard roles={['hr', 'accountant', 'director']}><Payroll /></Guard>} />
                <Route path="advances" element={<Advances />} />
                <Route path="approvals" element={<Guard roles={['manager', 'hr', 'accountant', 'director']}><Approvals /></Guard>} />
                <Route path="proposals" element={<Guard roles={['manager', 'hr', 'accountant', 'director']}><Proposals /></Guard>} />
                <Route path="onboarding" element={<Guard roles={['hr']}><Onboarding /></Guard>} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="executive" element={<Guard roles={['hr', 'director']}><Executive /></Guard>} />
                <Route path="lineage" element={<Guard roles={['hr', 'director', 'sysadmin']}><Lineage /></Guard>} />
                <Route path="temp-access" element={<Guard roles={['sysadmin', 'hr', 'accountant', 'director']}><TempAccess /></Guard>} />
                <Route path="audit" element={<Guard roles={['sysadmin', 'director', 'hr']}><Audit /></Guard>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
