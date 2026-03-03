import { Routes, Route, Link, useLocation, Outlet } from 'react-router-dom';
import { Layout, Typography, Menu } from 'antd';
import { FileSearchOutlined, HistoryOutlined, CalendarOutlined } from '@ant-design/icons';
import CheckPage from './CheckPage';
import { HistoryPage } from './HistoryPage';
import { SchedulesPage } from './SchedulesPage';

const { Header, Content } = Layout;
const { Title } = Typography;

function AppLayout() {
  const location = useLocation();
  const path = location.pathname;
  const current = path === '/history' ? 'history' : path === '/schedules' ? 'schedules' : 'check';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <Title level={4} style={{ margin: 0, color: 'rgba(255,255,255,0.85)' }}>
          Мониторинг сайтов
        </Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[current]}
          style={{ flex: 1, minWidth: 0 }}
          items={[
            {
              key: 'check',
              icon: <FileSearchOutlined />,
              label: <Link to="/">Проверка</Link>,
            },
            {
              key: 'history',
              icon: <HistoryOutlined />,
              label: <Link to="/history">История проверок</Link>,
            },
            {
              key: 'schedules',
              icon: <CalendarOutlined />,
              label: <Link to="/schedules">Расписания</Link>,
            },
          ]}
        />
      </Header>
      <Content>
        <Outlet />
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<CheckPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
      </Route>
    </Routes>
  );
}
