// SPDX-License-Identifier: Apache-2.0
// Trang tài liệu API PeopleOS - dựng bằng Docusaurus (cùng công cụ với reactnative.dev).
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'PeopleOS',
  tagline: 'Nền tảng nhân sự & đãi ngộ nguồn mở - tài liệu API cho developer',
  favicon: 'img/favicon.svg',

  // Đổi url/baseUrl khi triển khai (ví dụ GitHub Pages: https://nguyen16112006.github.io, baseUrl '/PeopleOS/').
  url: process.env.DOCS_URL ?? 'https://nguyen16112006.github.io',
  baseUrl: process.env.DOCS_BASE_URL ?? '/PeopleOS/',
  organizationName: 'Nguyen16112006',
  projectName: 'PeopleOS',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: {onBrokenMarkdownLinks: 'throw'},
  },

  i18n: {defaultLocale: 'vi', locales: ['vi']},

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/Nguyen16112006/PeopleOS/edit/main/website/',
          showLastUpdateTime: false,
          lastVersion: 'current',
          versions: {current: {label: '2.3.0'}},
        },
        blog: {
          blogTitle: 'Blog PeopleOS',
          blogDescription: 'Tin phát hành và bài kỹ thuật về PeopleOS',
          blogSidebarTitle: 'Bài gần đây',
          blogSidebarCount: 'ALL',
          showReadingTime: true,
          onInlineAuthors: 'ignore',
          onUntruncatedBlogPosts: 'ignore',
        },
        theme: {customCss: './src/css/custom.css'},
      }),
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        indexBlog: true,
        docsRouteBasePath: '/docs',
        language: ['vi', 'en'],
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: true,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {defaultMode: 'light', respectPrefersColorScheme: true},
      docs: {sidebar: {hideable: true, autoCollapseCategories: false}},
      tableOfContents: {minHeadingLevel: 2, maxHeadingLevel: 3},
      announcementBar: {
        id: 'v230',
        content: 'PeopleOS <b>2.3.0</b> - bản phát hành cho OLP PMNM 2026. ' +
          '<a href="https://github.com/Nguyen16112006/PeopleOS">Xem trên GitHub</a>',
        backgroundColor: '#1e2f4f',
        textColor: '#dbe4f3',
        isCloseable: true,
      },
      navbar: {
        title: 'PeopleOS',
        logo: {alt: 'PeopleOS', src: 'img/logo.svg'},
        style: 'dark',
        hideOnScroll: false,
        items: [
          {
            type: 'dropdown',
            label: 'Tài liệu',
            position: 'left',
            items: [
              {type: 'docSidebar', sidebarId: 'guides', label: 'Hướng dẫn'},
              {type: 'docSidebar', sidebarId: 'platform', label: 'Platform API'},
              {type: 'docSidebar', sidebarId: 'api', label: 'HR Workspace API'},
              {type: 'doc', docId: 'architecture', label: 'Kiến trúc'},
            ],
          },
          {href: 'https://github.com/Nguyen16112006/PeopleOS/blob/main/CHANGELOG.md', label: 'Phát hành', position: 'left'},
          {to: '/community', label: 'Cộng đồng', position: 'left'},
          {to: '/blog', label: 'Blog', position: 'left'},
          {type: 'docsVersionDropdown', position: 'right'},
          {
            href: 'https://github.com/Nguyen16112006/PeopleOS',
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'GitHub',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Phát triển',
            items: [
              {label: 'Hướng dẫn', to: '/docs/getting-started'},
              {label: 'Platform API', to: '/docs/platform/overview'},
              {label: 'HR Workspace API', to: '/docs/workspace/overview'},
              {label: 'Kiến trúc', to: '/docs/architecture'},
            ],
          },
          {
            title: 'Tham gia',
            items: [
              {label: 'Cộng đồng', to: '/community'},
              {label: 'Hướng dẫn đóng góp', href: 'https://github.com/Nguyen16112006/PeopleOS/blob/main/CONTRIBUTING.md'},
              {label: 'Quy tắc ứng xử', href: 'https://github.com/Nguyen16112006/PeopleOS/blob/main/CODE_OF_CONDUCT.md'},
              {label: 'Chính sách bảo mật', href: 'https://github.com/Nguyen16112006/PeopleOS/blob/main/SECURITY.md'},
            ],
          },
          {
            title: 'Theo dõi',
            items: [
              {label: 'Blog', to: '/blog'},
              {label: 'GitHub', href: 'https://github.com/Nguyen16112006/PeopleOS'},
              {label: 'Báo lỗi', href: 'https://github.com/Nguyen16112006/PeopleOS/issues'},
              {label: 'Nhật ký thay đổi', href: 'https://github.com/Nguyen16112006/PeopleOS/blob/main/CHANGELOG.md'},
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} PeopleOS contributors · Apache-2.0`,
      },
      mermaid: {theme: {light: 'neutral', dark: 'dark'}},
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'java', 'python', 'graphql', 'http'],
      },
    }),
};

export default config;
