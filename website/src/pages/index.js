import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import useBaseUrl from '@docusaurus/useBaseUrl';

const QUERY = `query NhomKinhDoanh {
  employees(where: {department: {_eq: "Kinh doanh"}}) {
    full_name
    job_title
    manager { full_name }
    leave_requests(where: {status: {_eq: "pending"}}) {
      start_date
      end_date
      days
    }
  }
}`;

const CALL = `const res = await fetch('https://peopleos.congty.vn/v1/data', {
  method: 'POST',
  headers: {'X-API-Key': process.env.PEOPLEOS_API_KEY},
  body: JSON.stringify({query}),
});`;

function Hero() {
  return (
    <header className="home-hero">
      <div className="container">
        <img className="home-hero__logo" src={useBaseUrl('/img/logo.svg')} alt="" width="96" height="96" />
        <h1 className="home-hero__title">PeopleOS</h1>
        <p className="home-hero__tagline">Lấy API key. Có ngay phần mềm nhân sự.</p>
        <div className="hero__buttons">
          <Link className="button button--warning button--lg" to="/docs/getting-started">Bắt đầu</Link>
          <Link className="button button--secondary button--lg" to="/docs/concepts/projects">Tìm hiểu khái niệm</Link>
        </div>
      </div>
    </header>
  );
}

function Split({title, children, code, language = 'graphql', reverse, alt}) {
  return (
    <section className={`home-section${alt ? ' home-section--alt' : ''}`}>
      <div className={`container home-split${reverse ? ' home-split--reverse' : ''}`}>
        <div className="home-split__text">
          <h2>{title}</h2>
          {children}
        </div>
        <div className="home-split__media">
          {typeof code === 'string' ? <CodeBlock language={language}>{code}</CodeBlock> : code}
        </div>
      </div>
    </section>
  );
}

function Diagram() {
  const apps = ['App chấm công', 'App tuyển dụng', 'Chatbot nội bộ'];
  const core = ['employees', 'contracts', 'leave_requests', 'payrolls', 'timesheets', 'insurance'];
  return (
    <div className="home-diagram" aria-label="Nhiều ứng dụng dùng chung một lõi dữ liệu nhân sự qua API Gateway">
      <div className="home-diagram__row">
        {apps.map((a) => <span key={a} className="home-diagram__app">{a}</span>)}
      </div>
      <div className="home-diagram__arrow">X-API-Key ↓</div>
      <div className="home-diagram__gw">API Gateway · xác thực · hạn mức · gắn tenant</div>
      <div className="home-diagram__arrow">↓</div>
      <div className="home-diagram__core">
        <div className="home-diagram__core-title">Lõi nhân sự của dự án</div>
        <div className="home-diagram__chips">
          {core.map((c) => <code key={c}>{c}</code>)}
          <code className="home-diagram__ext">ext_*</code>
        </div>
      </div>
      <div className="home-diagram__arrow">↓ webhook</div>
      <div className="home-diagram__row"><span className="home-diagram__app">Máy chủ của bạn</span></div>
    </div>
  );
}

const EXTEND = [
  {
    title: 'Bảng dữ liệu riêng',
    text: 'Khai báo bảng bằng JSON, không viết SQL. Bảng có ngay GraphQL, cô lập theo tenant và khóa ngoại tới nhân viên.',
    to: '/docs/concepts/extending',
    code: '{"table": "shift_swaps", "columns": [...]}',
  },
  {
    title: 'Trường tùy chỉnh',
    text: 'Thêm cỡ áo, mã máy chấm công… vào hồ sơ nhân viên. Kiểu dữ liệu được kiểm ngay ở cơ sở dữ liệu.',
    to: '/docs/guides/custom-data',
    code: '{"key": "shirt_size", "type": "enum"}',
  },
  {
    title: 'Webhook có chữ ký',
    text: 'Nhận sự kiện khi nhân viên, hợp đồng, đơn nghỉ hay bảng lương thay đổi. Tự thử lại, phát lại được.',
    to: '/docs/guides/webhooks',
    code: 'leave_request.updated',
  },
];

const STEPS = [
  ['Đăng ký', 'Tạo tài khoản developer trên Developer Portal.'],
  ['Tạo dự án', 'Mỗi dự án là một vùng dữ liệu nhân sự riêng.'],
  ['Lấy API key', 'Chọn quyền đọc hoặc đọc và ghi.'],
  ['Gọi API', 'Một endpoint GraphQL cho mọi dữ liệu.'],
];

const STACK = ['Apache APISIX', 'Keycloak', 'PostgreSQL', 'Hasura', 'NATS', 'MinIO', 'Flowable', 'Ollama', 'Qdrant', 'Spring Boot', 'React'];

export default function Home() {
  return (
    <Layout title="Nền tảng nhân sự nguồn mở cho developer"
      description="PeopleOS PaaS - lõi dữ liệu nhân sự dùng chung, lấy API key là xây được ứng dụng HR.">
      <Hero />
      <main>
        <Split title="Xây ứng dụng nhân sự bằng GraphQL" code={QUERY}>
          <p>
            Hồ sơ nhân viên, hợp đồng, nghỉ phép, chấm công, bảng lương theo nghiệp vụ Việt Nam đã có sẵn.
            Một truy vấn lấy đúng phần dữ liệu bạn cần, kèm quan hệ - không cần tự thiết kế cơ sở dữ liệu.
          </p>
          <CodeBlock language="js">{CALL}</CodeBlock>
          <p className="home-callout">Viết bằng ngôn ngữ bạn chọn. Chạy trên lõi nhân sự dùng chung.</p>
        </Split>

        <Split title="Một lõi dữ liệu, nhiều ứng dụng" code={<Diagram />} reverse alt>
          <p>
            Mỗi phần mềm nhân sự thường giữ một bản sao dữ liệu riêng: chấm công một nơi, lương một nơi, tuyển dụng một nơi.
            Với PeopleOS, mọi ứng dụng cùng đọc ghi <b>một lõi</b> qua API Gateway, và nhận thay đổi của nhau qua webhook.
          </p>
          <p>
            Mỗi dự án là một <Link to="/docs/concepts/projects">tenant</Link> được cô lập bằng
            {' '}<Link to="/docs/concepts/isolation">ba lớp</Link>: permission, Row-Level Security và khóa ngoại tổng hợp.
          </p>
        </Split>

        <section className="home-section">
          <div className="container">
            <h2 className="text--center">Mở rộng theo cách của bạn</h2>
            <p className="lead">Lõi dùng chung không giới hạn ứng dụng của bạn.</p>
            <div className="row">
              {EXTEND.map((f) => (
                <div key={f.title} className="col col--4 margin-bottom--lg">
                  <Link className="feature-card" to={f.to}>
                    <span className="feature-card__tag">{f.code}</span>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section home-section--alt">
          <div className="container">
            <h2 className="text--center">Bắt đầu trong bốn bước</h2>
            <p className="lead">Từ con số 0 tới lời gọi API đầu tiên trong khoảng 5 phút.</p>
            <ol className="home-steps">
              {STEPS.map(([t, d], i) => (
                <li key={t}>
                  <span className="home-steps__n">{i + 1}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ol>
            <div className="text--center margin-top--lg">
              <Link className="button button--primary button--lg" to="/docs/getting-started">Làm theo hướng dẫn</Link>
            </div>
          </div>
        </section>

        <section className="home-section">
          <div className="container text--center">
            <h2>Nguồn mở. Tự triển khai.</h2>
            <p className="lead">
              Apache-2.0, dựng trên các dự án nguồn mở trưởng thành. Chạy trên máy bạn bằng Docker Compose hoặc trên Kubernetes -
              dữ liệu nhân sự không phải rời khỏi hạ tầng của công ty.
            </p>
            <div className="home-stack">
              {STACK.map((s) => <span key={s}>{s}</span>)}
            </div>
            <div className="margin-top--lg">
              <Link to="/docs/architecture">Xem kiến trúc →</Link>
            </div>
          </div>
        </section>

        <section className="home-cta">
          <div className="container text--center">
            <h2>Sẵn sàng xây ứng dụng đầu tiên?</h2>
            <p>Làm một ứng dụng quản lý nghỉ phép có webhook, chỉ với Node.js.</p>
            <Link className="button button--warning button--lg" to="/docs/guides/first-app">Bắt đầu tutorial</Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
