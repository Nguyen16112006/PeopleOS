import React from 'react';

// Khóa vai trò trong hệ thống -> nhãn hiển thị (xem docs/ROLES_AND_WORKFLOWS.md).
export const ROLE_LABEL = {
  employee: 'Nhân viên',
  manager: 'Quản lý',
  hr: 'HR',
  director: 'Giám đốc',
  accountant: 'Kế toán',
  sysadmin: 'Admin',
  any: 'Đăng nhập',
  owner: 'Chủ bản ghi',
  public: 'Công khai',
  developer: 'Developer',
  apikey: 'API key',
  internal: 'x-internal-key',
  secret: 'x-platform-secret',
};

export function Role({id}) {
  return (
    <span className={`role-chip${id === 'public' ? ' role-chip--public' : ''}`} title={id}>
      {ROLE_LABEL[id] ?? id}
    </span>
  );
}

/**
 * Khối tiêu đề endpoint, dùng ngay dưới một heading ###.
 *   <Endpoint method="POST" path="/api/leave-requests" roles={['any']} />
 */
export default function Endpoint({method = 'GET', path, roles = []}) {
  return (
    <div className={`endpoint endpoint--${method}`}>
      <span className="endpoint__method">{method}</span>
      <code className="endpoint__path">{path}</code>
      {roles.length > 0 && (
        <span className="endpoint__roles" aria-label="Vai trò được gọi">
          {roles.map((r) => <Role key={r} id={r} />)}
        </span>
      )}
    </div>
  );
}
