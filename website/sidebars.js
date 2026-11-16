// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

// Bố cục học theo reactnative.dev: Hướng dẫn (học dần từ cơ bản) · Platform API · HR Workspace API.
/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  guides: [
    {
      type: 'category',
      label: 'Bắt đầu',
      collapsible: false,
      items: ['intro', 'getting-started', 'environment-setup'],
    },
    {
      type: 'category',
      label: 'Khái niệm cốt lõi',
      collapsible: false,
      items: [
        'concepts/projects',
        'concepts/api-keys',
        'concepts/data-model',
        'concepts/extending',
        'concepts/events',
        'concepts/plans',
        'concepts/isolation',
      ],
    },
    {
      type: 'category',
      label: 'Hướng dẫn thực hành',
      collapsible: false,
      items: [
        'guides/developer-portal',
        'guides/first-app',
        'guides/custom-data',
        'guides/webhooks',
        'guides/end-user-login',
        'guides/go-live',
      ],
    },
    {
      type: 'category',
      label: 'Tham khảo chung',
      collapsible: false,
      items: ['authentication', 'conventions', 'guides/troubleshooting', 'architecture'],
    },
  ],
  platform: [
    'platform/overview',
    {
      type: 'category',
      label: 'Control plane',
      collapsible: false,
      items: ['platform/projects', 'platform/api-keys', 'platform/schema', 'platform/custom-fields', 'platform/users', 'platform/usage'],
    },
    {
      type: 'category',
      label: 'Data plane',
      collapsible: false,
      items: ['platform/data-api', 'platform/webhooks'],
    },
  ],
  api: [
    'workspace/overview',
    {
      type: 'category',
      label: 'Nền tảng',
      collapsible: false,
      items: ['roles', 'graphql', 'realtime', 'ai-assistant'],
    },
    {
      type: 'category',
      label: 'Hồ sơ & tài khoản',
      collapsible: false,
      items: ['workspace/me', 'workspace/employees', 'workspace/offboarding', 'workspace/documents'],
    },
    {
      type: 'category',
      label: 'Chấm công & lương',
      collapsible: false,
      items: ['workspace/attendance', 'workspace/payroll-runs', 'workspace/payslip-complaints', 'workspace/tax-year'],
    },
    {
      type: 'category',
      label: 'Phê duyệt',
      collapsible: false,
      items: ['workspace/leave-requests', 'workspace/salary-proposals', 'workspace/advance-requests', 'workspace/kpi'],
    },
    {
      type: 'category',
      label: 'Quản trị & bảo mật',
      collapsible: false,
      items: ['workspace/temp-access', 'workspace/audit', 'workspace/internal'],
    },
  ],
};

export default sidebars;
