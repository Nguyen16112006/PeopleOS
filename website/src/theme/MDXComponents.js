// Đăng ký component dùng chung cho mọi trang .md/.mdx (không cần import trong từng trang).
import MDXComponents from '@theme-original/MDXComponents';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import Endpoint, {Role} from '@site/src/components/Endpoint';

export default {...MDXComponents, Tabs, TabItem, Endpoint, Role};
